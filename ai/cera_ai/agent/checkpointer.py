"""LangGraph checkpointer that stores execution state through the Main Backend (T-104 · ADR-036 decision 2).

``thread_id`` is the CERA ``agent_run_id``. The whole checkpoint (including channel values) is serialized with
LangGraph's serde and sent as typed base64 — the Backend keeps it in its content store (ref + hash) and pending writes
in small rows. A new Python process can resume a run because nothing lives only in memory.

Checkpoints are *where to continue*, never business truth: graph nodes re-read approvals, facts and messages
through backend tools after a resume.
"""

from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator, Iterator, Sequence
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    get_checkpoint_id,
    get_checkpoint_metadata,
)

from .backend import RuntimeApiClient


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


class BackendCheckpointSaver(BaseCheckpointSaver[int]):
    def __init__(self, api: RuntimeApiClient) -> None:
        super().__init__()
        self._api = api

    # ── helpers ──
    def _encode(self, value: Any) -> dict[str, str]:
        kind, data = self.serde.dumps_typed(value)
        return {"type": kind, "b64": _b64(data)}

    def _decode(self, doc: dict[str, str]) -> Any:
        return self.serde.loads_typed((doc["type"], base64.b64decode(doc["b64"])))

    def _tuple(self, thread_id: str, doc: dict[str, Any]) -> CheckpointTuple:
        ns = doc["checkpoint_ns"]
        parent = doc.get("parent_checkpoint_id")
        return CheckpointTuple(
            config={"configurable": {"thread_id": thread_id, "checkpoint_ns": ns, "checkpoint_id": doc["checkpoint_id"]}},
            checkpoint=self._decode(doc["checkpoint"]),
            metadata=self._decode(doc["metadata"]),
            parent_config={"configurable": {"thread_id": thread_id, "checkpoint_ns": ns, "checkpoint_id": parent}} if parent else None,
            pending_writes=[(w["task_id"], w["channel"], self._decode({"type": w["type"], "b64": w["b64"]})) for w in doc.get("writes", [])],
        )

    # ── sync API (graph.invoke) ──
    def get_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        docs = self._api.get_checkpoints(thread_id, ns=ns, checkpoint_id=get_checkpoint_id(config), limit=1)
        return self._tuple(thread_id, docs[0]) if docs else None

    def list(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> Iterator[CheckpointTuple]:
        if config is None:
            return iter(())
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns")
        docs = self._api.get_checkpoints(
            thread_id,
            ns=ns,
            checkpoint_id=get_checkpoint_id(config),
            before=get_checkpoint_id(before) if before else None,
            limit=min(limit or 100, 100),
        )
        out = []
        for doc in docs:
            t = self._tuple(thread_id, doc)
            if filter and not all(t.metadata.get(k) == v for k, v in filter.items()):
                continue
            out.append(t)
        return iter(out)

    def put(self, config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: ChannelVersions) -> RunnableConfig:
        thread_id = config["configurable"]["thread_id"]
        ns = config["configurable"].get("checkpoint_ns", "")
        meta = get_checkpoint_metadata(config, metadata)
        self._api.put_checkpoint(
            thread_id,
            {
                "checkpoint_ns": ns,
                "checkpoint_id": checkpoint["id"],
                "parent_checkpoint_id": config["configurable"].get("checkpoint_id"),
                "checkpoint": self._encode(checkpoint),
                "metadata": self._encode(meta),
                "meta_source": str(meta.get("source")) if meta.get("source") is not None else None,
                "meta_step": int(meta["step"]) if isinstance(meta.get("step"), int) else None,
            },
        )
        return {"configurable": {"thread_id": thread_id, "checkpoint_ns": ns, "checkpoint_id": checkpoint["id"]}}

    def put_writes(self, config: RunnableConfig, writes: Sequence[tuple[str, Any]], task_id: str, task_path: str = "") -> None:
        thread_id = config["configurable"]["thread_id"]
        self._api.put_writes(
            thread_id,
            {
                "checkpoint_ns": config["configurable"].get("checkpoint_ns", ""),
                "checkpoint_id": config["configurable"]["checkpoint_id"],
                "task_id": task_id,
                "task_path": task_path,
                "writes": [{"idx": WRITES_IDX_MAP.get(channel, i), "channel": channel, **self._encode(value)} for i, (channel, value) in enumerate(writes)],
            },
        )

    def delete_thread(self, thread_id: str) -> None:
        raise NotImplementedError("agent runs are never deleted (append-only execution history)")

    # ── async API (delegates; the runtime uses the sync graph API) ──
    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        return await asyncio.to_thread(self.get_tuple, config)

    async def alist(self, config: RunnableConfig | None, *, filter: dict[str, Any] | None = None, before: RunnableConfig | None = None, limit: int | None = None) -> AsyncIterator[CheckpointTuple]:
        for t in await asyncio.to_thread(lambda: list(self.list(config, filter=filter, before=before, limit=limit))):
            yield t

    async def aput(self, config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: ChannelVersions) -> RunnableConfig:
        return await asyncio.to_thread(self.put, config, checkpoint, metadata, new_versions)

    async def aput_writes(self, config: RunnableConfig, writes: Sequence[tuple[str, Any]], task_id: str, task_path: str = "") -> None:
        await asyncio.to_thread(self.put_writes, config, writes, task_id, task_path)
