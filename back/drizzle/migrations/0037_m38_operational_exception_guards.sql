-- M38 운영 예외 가드 · 권한 (T-132 · ADR-040)
-- 사람이 쓴 custom migration. M01~M37 은 고치지 않는다.
-- operational_exception: 정체(종류 · 범위 · 시나리오 · 시설 · 날짜 · 처음 발견 시각)는 바뀌지 않는다. 바뀔 수 있는 것은 지금 숫자 · 근거 ·
--   상태(ACTIVE → RESOLVED 한 번, 해소된 예외는 다시 열지 않는다 — 다시 부족하면 새 예외) · 자동으로 만든 복구 실행(한 번 채움)뿐. 지우지 않는다.
-- operational_exception_observation: append-only — 그때 무엇을 보고 판단했는지는 바뀌거나 지워지지 않는다.

CREATE FUNCTION cera.fn_cera_guard_operational_exception() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'cera: a resolved operational exception is final (%)', OLD.exception_id
      USING ERRCODE = 'CE002';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'cera: operational_exception.updated_at cannot move backwards'
      USING ERRCODE = 'CE002';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception__columns BEFORE UPDATE ON cera.operational_exception
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('status', 'basis', 'scheduled_demand', 'capacity', 'shortage', 'recovery_run_id', 'updated_at', 'resolved_at');
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception__lifecycle BEFORE UPDATE ON cera.operational_exception
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_operational_exception();
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception__run_once BEFORE UPDATE OF recovery_run_id ON cera.operational_exception
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_one_time_fill('recovery_run_id');
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception__no_delete BEFORE DELETE ON cera.operational_exception
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception__no_truncate BEFORE TRUNCATE ON cera.operational_exception FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception_observation__append_only BEFORE UPDATE OR DELETE ON cera.operational_exception_observation
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception_observation__no_truncate BEFORE TRUNCATE ON cera.operational_exception_observation FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON cera.operational_exception TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cera.operational_exception_observation TO cera_app;
