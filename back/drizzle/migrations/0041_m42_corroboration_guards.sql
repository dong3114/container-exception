-- M42 공공 근거 교차 확인 · 예외 영향 컨테이너 가드 · 권한 (T-136)
-- 사람이 쓴 custom migration. M01~M41 은 고치지 않는다.
-- corroboration: append-only — 그때 무엇과 무엇을 비교해 어떻게 판정했는지는 바뀌거나 지워지지 않는다(새 공공 근거 = 새 행).
-- operational_exception_container: append-only — 그 관측에서 넘친 컨테이너는 바뀌지 않는다(다음 관측이 새 행을 남긴다).

CREATE TRIGGER tg_corroboration__append_only BEFORE UPDATE OR DELETE ON cera.corroboration
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_corroboration__no_truncate BEFORE TRUNCATE ON cera.corroboration FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception_container__append_only BEFORE UPDATE OR DELETE ON cera.operational_exception_container
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_operational_exception_container__no_truncate BEFORE TRUNCATE ON cera.operational_exception_container FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT ON cera.corroboration TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cera.operational_exception_container TO cera_app;
