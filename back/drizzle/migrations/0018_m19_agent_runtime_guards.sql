-- M19 Agent Runtime 가드 · 권한 (T-104 · ADR-036 결정 2 · docs/24 22.36 · 22.38 ~ 22.40)
-- 사람이 쓴 custom migration. M01~M18 은 고치지 않는다(M17 의 함수는 같은 이름으로 교체). 함수는 now() 를 부르지 않는다.
--
-- agent_run 생애주기(이 표만 허용):
--   CREATED          → RUNNING · CANCELLED
--   RUNNING          → WAITING_HUMAN · WAITING_EXTERNAL · WAITING_RUNTIME · COMPLETED · FAILED · CANCELLED
--   WAITING_HUMAN    → RUNNING · FAILED · CANCELLED
--   WAITING_EXTERNAL → RUNNING · FAILED · CANCELLED
--   WAITING_RUNTIME  → RUNNING · FAILED · CANCELLED   (Runtime 일시 장애 — 정해진 시각에 다시 시도, 상한 뒤 FAILED)
--   COMPLETED · FAILED · CANCELLED → (없음)
-- 실행은 CREATED 로만 만들어진다(Agent 행위자 = AI_AGENT, 만든 이 = HUMAN · SYSTEM — M17 규칙 그대로).
-- Tool 호출은 CREATED · RUNNING 실행에만(기다리는 · 끝난 실행은 Tool 을 부르지 않는다).
-- checkpoint · pending write 는 RUNNING 실행에만. checkpoint 는 append-only, write 는 특수 쓰기(write_idx < 0)만 덮어쓴다.
-- agent_step 은 append-only.

CREATE OR REPLACE FUNCTION cera.fn_cera_guard_agent_run() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  agent_type text;
  creator_type text;
  allowed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT a.actor_type INTO agent_type FROM cera.actor a WHERE a.actor_id = NEW.agent_actor_id;
    SELECT a.actor_type INTO creator_type FROM cera.actor a WHERE a.actor_id = NEW.created_by_actor_id;
    IF agent_type IS DISTINCT FROM 'AI_AGENT' THEN
      RAISE EXCEPTION 'cera: agent_run.agent_actor_id must be an AI_AGENT actor (got %)', agent_type USING ERRCODE = 'CE005';
    END IF;
    IF creator_type IS NULL OR creator_type NOT IN ('HUMAN', 'SYSTEM') THEN
      RAISE EXCEPTION 'cera: an agent run is created by a HUMAN or SYSTEM actor (got %)', creator_type USING ERRCODE = 'CE005';
    END IF;
    IF NEW.status <> 'CREATED' THEN
      RAISE EXCEPTION 'cera: an agent run starts CREATED (got %)', NEW.status USING ERRCODE = 'CE005';
    END IF;
    RETURN NEW;
  END IF;
  allowed := CASE OLD.status
    WHEN 'CREATED' THEN NEW.status IN ('RUNNING', 'CANCELLED')
    WHEN 'RUNNING' THEN NEW.status IN ('WAITING_HUMAN', 'WAITING_EXTERNAL', 'WAITING_RUNTIME', 'COMPLETED', 'FAILED', 'CANCELLED')
    WHEN 'WAITING_HUMAN' THEN NEW.status IN ('RUNNING', 'FAILED', 'CANCELLED')
    WHEN 'WAITING_EXTERNAL' THEN NEW.status IN ('RUNNING', 'FAILED', 'CANCELLED')
    WHEN 'WAITING_RUNTIME' THEN NEW.status IN ('RUNNING', 'FAILED', 'CANCELLED')
    ELSE false
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'cera: agent run % may not go % -> %', OLD.agent_run_id, OLD.status, NEW.status USING ERRCODE = 'CE004';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- 바뀔 수 있는 열: 상태 · 끝난 시각 · 실행 위치(노드 · 대기 사유 · 대기 대상) · 마지막 오류 · 갱신 시각 · Runtime 재시도(횟수 · 다음 시각) · 끝난 요약. 범위 · 행위자 · 목표 · 사람이 준 값은 불변
DROP TRIGGER tg_agent_run__guard_columns ON cera.agent_run;
--> statement-breakpoint
CREATE TRIGGER tg_agent_run__guard_columns BEFORE UPDATE ON cera.agent_run
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('status', 'finished_at', 'current_node', 'waiting_reason', 'pending_ref_type', 'pending_ref_id', 'last_error_code', 'updated_at', 'runtime_attempts', 'next_attempt_at', 'result_summary');
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cera.fn_cera_guard_agent_tool_call() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT r.status INTO run_status FROM cera.agent_run r WHERE r.agent_run_id = NEW.agent_run_id;
    IF run_status IS NULL OR run_status NOT IN ('CREATED', 'RUNNING') THEN
      RAISE EXCEPTION 'cera: tool calls are recorded only for a CREATED or RUNNING agent run (got %)', run_status USING ERRCODE = 'CE005';
    END IF;
    IF NEW.status NOT IN ('STARTED', 'REJECTED') THEN
      RAISE EXCEPTION 'cera: a tool call is recorded STARTED, or REJECTED before it runs (got %)', NEW.status USING ERRCODE = 'CE005';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'STARTED' OR NEW.status = 'STARTED' THEN
    RAISE EXCEPTION 'cera: tool call % may only go STARTED -> SUCCEEDED | FAILED | REJECTED once (% -> %)', OLD.tool_call_id, OLD.status, NEW.status
      USING ERRCODE = 'CE004';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- checkpoint · pending write 는 RUNNING 실행에만(그래프가 도는 동안만)
CREATE FUNCTION cera.fn_cera_guard_agent_runtime_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run_status text;
BEGIN
  SELECT r.status INTO run_status FROM cera.agent_run r WHERE r.agent_run_id = NEW.agent_run_id;
  IF run_status IS DISTINCT FROM 'RUNNING' THEN
    RAISE EXCEPTION 'cera: % is written only while the agent run is RUNNING (got %)', TG_TABLE_NAME, run_status USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_agent_checkpoint__guard_insert BEFORE INSERT ON cera.agent_checkpoint
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_agent_runtime_insert();
--> statement-breakpoint
CREATE TRIGGER tg_agent_checkpoint_write__guard_insert BEFORE INSERT ON cera.agent_checkpoint_write
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_agent_runtime_insert();
--> statement-breakpoint
CREATE TRIGGER tg_agent_checkpoint__append_only BEFORE UPDATE OR DELETE ON cera.agent_checkpoint
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_agent_step__append_only BEFORE UPDATE OR DELETE ON cera.agent_step
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_agent_checkpoint_write__no_delete BEFORE DELETE ON cera.agent_checkpoint_write
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
-- LangGraph 의 특수 쓰기(오류 · interrupt · resume — 음수 순번)만 덮어쓴다. 보통 쓰기는 한 번
CREATE FUNCTION cera.fn_cera_guard_checkpoint_write_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.write_idx >= 0 THEN
    RAISE EXCEPTION 'cera: checkpoint write (task %, idx %) is written once', OLD.task_id, OLD.write_idx USING ERRCODE = 'CE003';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_agent_checkpoint_write__guard_update BEFORE UPDATE ON cera.agent_checkpoint_write
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_checkpoint_write_update();
--> statement-breakpoint
CREATE TRIGGER tg_agent_checkpoint_write__guard_columns BEFORE UPDATE ON cera.agent_checkpoint_write
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('channel', 'value_type', 'value_b64', 'value_hash', 'task_path', 'created_at');
--> statement-breakpoint

-- 실행 관측 · checkpoint: SELECT · INSERT / pending write: SELECT · INSERT · UPDATE(특수 쓰기만 — 트리거)
GRANT SELECT, INSERT ON cera.agent_step, cera.agent_checkpoint TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON cera.agent_checkpoint_write TO cera_app;
