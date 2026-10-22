-- M17 Agent 실행 · Tool 호출 가드 · 권한 (T-103 · ADR-036 · docs/24 22.36 · 22.37)
-- 사람이 쓴 custom migration. M01~M16 은 고치지 않는다. 함수는 now() 를 부르지 않는다.
--
-- agent_run:
--   · Agent 행위자는 AI_AGENT, 실행을 만든 주체는 HUMAN 또는 SYSTEM(Agent 가 자기 범위를 고르지 못한다)
--   · ACTIVE → FINISHED · CANCELLED 한 번. 범위(recovery_run_id) · 행위자 · 목표는 바뀌지 않는다. 삭제 없음
-- agent_tool_call:
--   · ACTIVE 실행에만 기록된다. 처음 기록은 STARTED(실행) 또는 REJECTED(실행 전 거부 — 범위 · 인자)
--   · STARTED → SUCCEEDED · FAILED · REJECTED 한 번. 바뀔 수 있는 열은 결과 열뿐. 삭제 없음

CREATE FUNCTION cera.fn_cera_guard_agent_run() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  agent_type text;
  creator_type text;
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
    IF NEW.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'cera: an agent run starts ACTIVE' USING ERRCODE = 'CE005';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'ACTIVE' OR NEW.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'cera: agent run % may only go ACTIVE -> FINISHED | CANCELLED once (% -> %)', OLD.agent_run_id, OLD.status, NEW.status
      USING ERRCODE = 'CE004';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_agent_run__guard_insert BEFORE INSERT ON cera.agent_run
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_agent_run();
--> statement-breakpoint
CREATE TRIGGER tg_agent_run__guard_columns BEFORE UPDATE ON cera.agent_run
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('status', 'finished_at');
--> statement-breakpoint
CREATE TRIGGER tg_agent_run__guard_transition BEFORE UPDATE OF status ON cera.agent_run
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_agent_run();
--> statement-breakpoint
CREATE TRIGGER tg_agent_run__no_delete BEFORE DELETE ON cera.agent_run
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint

CREATE FUNCTION cera.fn_cera_guard_agent_tool_call() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  run_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT r.status INTO run_status FROM cera.agent_run r WHERE r.agent_run_id = NEW.agent_run_id;
    IF run_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'cera: tool calls are recorded only for an ACTIVE agent run (got %)', run_status USING ERRCODE = 'CE005';
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
CREATE TRIGGER tg_agent_tool_call__guard_insert BEFORE INSERT ON cera.agent_tool_call
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_agent_tool_call();
--> statement-breakpoint
CREATE TRIGGER tg_agent_tool_call__guard_columns BEFORE UPDATE ON cera.agent_tool_call
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('status', 'output_hash', 'result_ref_type', 'result_ref_id', 'error_code', 'finished_at', 'duration_ms');
--> statement-breakpoint
CREATE TRIGGER tg_agent_tool_call__guard_transition BEFORE UPDATE OF status ON cera.agent_tool_call
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_agent_tool_call();
--> statement-breakpoint
CREATE TRIGGER tg_agent_tool_call__no_delete BEFORE DELETE ON cera.agent_tool_call
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint

-- 실행 기록 2표: SELECT · INSERT · UPDATE (열 · 전이는 트리거가 제한, DELETE 없음)
GRANT SELECT, INSERT, UPDATE ON cera.agent_run, cera.agent_tool_call TO cera_app;
