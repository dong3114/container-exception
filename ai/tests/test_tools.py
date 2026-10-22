import json
import logging

import httpx
import pytest

from cera_ai.tools import BackendToolClient, load_registry
from cera_ai.tools.schema_check import SchemaError, errors

TOKEN = "t0k3n-" + "x" * 40
RUN = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b199"
MSG = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b198"
REGISTRY = load_registry()


def client(handler):
    return BackendToolClient("http://backend.test", TOKEN, REGISTRY, http=httpx.Client(transport=httpx.MockTransport(handler)))


def envelope(tool, status="SUCCEEDED", output=None, error=None, replayed=False):
    return {"schema_version": "agent-tool/1", "tool": tool, "tool_call_id": MSG, "status": status, "replayed": replayed, "output": output, "error": error}


def test_registry_comes_from_the_backend_contract_and_has_no_commit_tools():
    assert REGISTRY.names() == [
        "get_vessel_calls", "get_vessel_call", "get_container_manifest", "get_recovery_context", "get_information_gaps",
        "find_counterparty", "create_inquiry_draft", "get_communication_status", "request_approval",
    ]
    assert {t.category for t in REGISTRY.tools.values()} <= {"READ", "EXTERNAL_READ", "PROPOSE", "REQUEST"}
    for forbidden in ("approve_draft", "send", "request_send", "confirm_fact", "select_final_plan"):
        assert REGISTRY.get(forbidden) is None
    assert {t.name for t in REGISTRY.tools.values() if t.idempotency == "REQUIRED"} == {"create_inquiry_draft", "request_approval"}
    assert all(t.has_side_effects == (t.idempotency == "REQUIRED") for t in REGISTRY.tools.values())


def test_checks_arguments_locally_and_never_calls_the_backend_for_a_bad_call():
    calls = []
    c = client(lambda req: calls.append(req) or httpx.Response(500))
    bad = c.call("get_vessel_calls", {"from_date": "2026/10/20", "to_date": "2026-10-21"}, agent_run_id=RUN)
    assert (bad.status, bad.error.code) == ("REJECTED", "INVALID_ARGUMENT")
    assert c.call("create_inquiry_draft", {"address_id": MSG, "intent": "TRUCK_SLOT", "values": [{"key": "quantity", "value_number": 2}]}, agent_run_id=RUN).error.code == "IDEMPOTENCY_KEY_REQUIRED"
    assert c.call("approve_draft", {}, agent_run_id=RUN).error.code == "TOOL_NOT_FOUND"
    assert calls == []


def test_sends_service_auth_scope_and_idempotency_headers_and_validates_the_output():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["headers"] = dict(req.headers)
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json=envelope("get_communication_status", output={"messages": []}))

    result = client(handler).call("get_communication_status", {}, agent_run_id=RUN, idempotency_key="ignored-for-reads", traceparent="00-" + "a" * 32 + "-" + "b" * 16 + "-01")
    assert result.ok and result.output == {"messages": []}
    assert seen["url"] == "http://backend.test/internal/agent-tools/get_communication_status"
    assert TOKEN not in seen["url"]
    assert seen["headers"]["authorization"] == f"Bearer {TOKEN}"
    assert seen["headers"]["x-cera-agent-run-id"] == RUN
    assert seen["body"] == {}


def test_backend_output_that_breaks_the_contract_is_a_failure():
    c = client(lambda req: httpx.Response(200, json=envelope("get_communication_status", output={"messages": [{"message_id": "not-a-uuid"}]})))
    result = c.call("get_communication_status", {}, agent_run_id=RUN)
    assert (result.status, result.error.code) == ("FAILED", "OUTPUT_CONTRACT_VIOLATION")


def test_typed_refusals_and_failures_are_returned_not_raised():
    refused = client(lambda req: httpx.Response(401, json=envelope("get_recovery_context", status="REJECTED", error={"code": "UNAUTHORIZED_AGENT", "retryable": False, "message": "token"})))
    r = refused.call("get_recovery_context", {}, agent_run_id=RUN)
    assert (r.status, r.error.code, r.http_status) == ("REJECTED", "UNAUTHORIZED_AGENT", 401)
    scoped = client(lambda req: httpx.Response(200, json=envelope("request_approval", status="REJECTED", error={"code": "OUT_OF_SCOPE", "retryable": False, "message": "other run"})))
    assert scoped.call("request_approval", {"message_id": MSG}, agent_run_id=RUN, idempotency_key="k1").error.code == "OUT_OF_SCOPE"

    def slow(req):
        raise httpx.ReadTimeout("slow", request=req)

    timed_out = client(slow).call("get_vessel_calls", {"from_date": "2026-10-20", "to_date": "2026-10-21"}, agent_run_id=RUN)
    assert (timed_out.status, timed_out.error.code, timed_out.error.retryable) == ("FAILED", "TOOL_TIMEOUT", True)
    garbage = client(lambda req: httpx.Response(200, text="<html>"))
    assert garbage.call("get_recovery_context", {}, agent_run_id=RUN).error.code == "BACKEND_PROTOCOL_ERROR"


def test_the_token_never_appears_in_repr_or_logs(caplog):
    caplog.set_level(logging.DEBUG, logger="cera_ai.tools")
    c = client(lambda req: httpx.Response(200, json=envelope("get_communication_status", output={"messages": []})))
    c.call("get_communication_status", {}, agent_run_id=RUN)
    assert TOKEN not in repr(c)
    assert TOKEN not in caplog.text
    with pytest.raises(ValueError):
        BackendToolClient("http://backend.test", "short", REGISTRY)


def test_schema_checker_supports_the_generated_subset_and_refuses_anything_else():
    schema = REGISTRY.get("create_inquiry_draft").input_schema
    ok = {"address_id": MSG, "intent": "FACILITY_CAPACITY", "values": [{"key": "quantity", "value_number": 3, "unit": "CONTAINER"}, {"key": "date", "value_text": "2026-10-13"}]}
    assert errors(schema, ok) == []
    assert any("not allowed" in e for e in errors(schema, {**ok, "source_run_id": MSG}))  # the agent cannot pick the plan run
    with pytest.raises(SchemaError):
        errors({"$ref": "#/x"}, {})
