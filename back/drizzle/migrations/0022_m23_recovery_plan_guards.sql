-- M23 복구 계획 가드 · 권한 (T-114 · docs/24 22.43)
-- 사람이 쓴 custom migration. M01~M22 는 고치지 않는다. 함수는 now() 를 부르지 않는다.
--
-- recovery_plan 생애주기(이 표만 허용):
--   (삽입)      → PROPOSED · INFEASIBLE  (승인된 상태로 만들 수 없다)
--   PROPOSED   → APPROVED · SUPERSEDED · OUTDATED
--   APPROVED   → SUPERSEDED · OUTDATED
--   OUTDATED   → SUPERSEDED
--   INFEASIBLE → SUPERSEDED · OUTDATED
--   SUPERSEDED → (없음)
-- 승인자는 사람(HUMAN)만. Agent · 시스템은 계획을 승인하지 못한다(SQL 로도). 승인은 실행 지시가 아니다 — 배차 · 발송은 없다.
-- 바뀔 수 있는 열: 상태 · 무효 사유 · 무효 시각 · 밀어낸 판 · 승인자 · 승인 시각 · 갱신 시각. Solver 결과 · 숫자 · 입력 지문은 불변.
-- recovery_plan_item 은 append-only(판이 바뀌면 새 판의 행을 새로 쓴다).
-- 새 판을 넣는 트랜잭션은 먼저 옛 판을 SUPERSEDED(밀어낸 판 = 새 판 id)로 바꾸고 새 판을 넣는다 — "지금 판은 하나"(부분 유일 인덱스)를
-- 지키려면 순서가 이래야 하므로 밀어낸 판 FK 는 커밋 때 검사한다(DEFERRABLE).

ALTER TABLE cera.recovery_plan ALTER CONSTRAINT fk_recovery_plan__superseded_by_plan_id DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

CREATE FUNCTION cera.fn_cera_guard_recovery_plan() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  approver_type text;
  allowed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.plan_status NOT IN ('PROPOSED', 'INFEASIBLE') THEN
      RAISE EXCEPTION 'cera: a recovery plan starts PROPOSED or INFEASIBLE (got %)', NEW.plan_status USING ERRCODE = 'CE005';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status THEN
    allowed := CASE OLD.plan_status
      WHEN 'PROPOSED' THEN NEW.plan_status IN ('APPROVED', 'SUPERSEDED', 'OUTDATED')
      WHEN 'APPROVED' THEN NEW.plan_status IN ('SUPERSEDED', 'OUTDATED')
      WHEN 'OUTDATED' THEN NEW.plan_status IN ('SUPERSEDED')
      WHEN 'INFEASIBLE' THEN NEW.plan_status IN ('SUPERSEDED', 'OUTDATED')
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'cera: recovery plan % may not go % -> %', OLD.plan_id, OLD.plan_status, NEW.plan_status USING ERRCODE = 'CE004';
    END IF;
  END IF;
  IF NEW.approved_by_actor_id IS DISTINCT FROM OLD.approved_by_actor_id THEN
    IF OLD.approved_by_actor_id IS NOT NULL OR NEW.plan_status <> 'APPROVED' THEN
      RAISE EXCEPTION 'cera: a recovery plan is approved once, by moving to APPROVED' USING ERRCODE = 'CE003';
    END IF;
    SELECT a.actor_type INTO approver_type FROM cera.actor a WHERE a.actor_id = NEW.approved_by_actor_id;
    IF approver_type IS DISTINCT FROM 'HUMAN' THEN
      RAISE EXCEPTION 'cera: only a HUMAN approves a recovery plan (got %)', approver_type USING ERRCODE = 'CE005';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_recovery_plan__guard BEFORE INSERT OR UPDATE ON cera.recovery_plan
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_recovery_plan();
--> statement-breakpoint
CREATE TRIGGER tg_recovery_plan__guard_columns BEFORE UPDATE ON cera.recovery_plan
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('plan_status', 'outdated_reasons', 'outdated_at', 'superseded_by_plan_id', 'approved_by_actor_id', 'approved_at', 'updated_at');
--> statement-breakpoint
CREATE TRIGGER tg_recovery_plan__no_delete BEFORE DELETE ON cera.recovery_plan
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_recovery_plan__no_truncate BEFORE TRUNCATE ON cera.recovery_plan FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_recovery_plan_item__append_only BEFORE UPDATE OR DELETE ON cera.recovery_plan_item
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_recovery_plan_item__no_truncate BEFORE TRUNCATE ON cera.recovery_plan_item FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

-- 계획 판: SELECT · INSERT · UPDATE(상태 열만 — 트리거) / 배정 행: SELECT · INSERT
GRANT SELECT, INSERT, UPDATE ON cera.recovery_plan TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cera.recovery_plan_item TO cera_app;
