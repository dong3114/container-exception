-- M40 실행 프로세스 heartbeat 가드 · 권한 (T-133)
-- 사람이 쓴 custom migration. M01~M39 는 고치지 않는다.
-- runtime_heartbeat: 종류(component)는 바뀌지 않고 나머지는 Worker 가 주기마다 갱신한다. 실행 상태이지만 지우지 않는다(운영 화면 근거).

CREATE TRIGGER tg_runtime_heartbeat__columns BEFORE UPDATE ON cera.runtime_heartbeat
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('instance_id', 'started_at', 'last_seen_at', 'last_cycle_ms', 'last_cycle_errors', 'queue_consumer', 'cycle_detail');
--> statement-breakpoint
CREATE TRIGGER tg_runtime_heartbeat__no_delete BEFORE DELETE ON cera.runtime_heartbeat
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_runtime_heartbeat__no_truncate BEFORE TRUNCATE ON cera.runtime_heartbeat FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON cera.runtime_heartbeat TO cera_app;
