-- M27 계획 후속 문의 가드 · 권한 (T-116 · docs/24 22.50)
-- 사람이 쓴 custom migration. M01~M26 은 고치지 않는다.
-- plan_follow_up 은 append-only — "이 판의 이 조치로 이 초안을 만들었다"는 기록은 바뀌거나 지워지지 않는다.
-- 초안의 승인 · 발송 가능 여부는 이 행이 아니라 판의 지금 상태(recovery_plan.plan_status)로 매번 판정한다(Backend).

CREATE TRIGGER tg_plan_follow_up__append_only BEFORE UPDATE OR DELETE ON cera.plan_follow_up
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_plan_follow_up__no_truncate BEFORE TRUNCATE ON cera.plan_follow_up FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT ON cera.plan_follow_up TO cera_app;
