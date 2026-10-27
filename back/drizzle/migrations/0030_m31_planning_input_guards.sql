-- M31 실제 계획 입력 가드 · 권한 (T-123 · docs/24 22.57)
-- 사람이 쓴 custom migration. M01~M30 은 고치지 않는다.
-- 네 표 모두 append-only — 고칠 때는 새 판(supersedes_*)을 넣는다. 계획 판의 스냅숏이 판 id 를 가리키므로 옛 판은 남아야 한다.

CREATE TRIGGER tg_planning_input_batch__append_only BEFORE UPDATE OR DELETE ON cera.planning_input_batch
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_planning_input_batch__no_truncate BEFORE TRUNCATE ON cera.planning_input_batch FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_planning_container_record__append_only BEFORE UPDATE OR DELETE ON cera.planning_container_record
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_planning_container_record__no_truncate BEFORE TRUNCATE ON cera.planning_container_record FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_tariff_rate__append_only BEFORE UPDATE OR DELETE ON cera.tariff_rate
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_tariff_rate__no_truncate BEFORE TRUNCATE ON cera.tariff_rate FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_facility_planning_profile__append_only BEFORE UPDATE OR DELETE ON cera.facility_planning_profile
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_facility_planning_profile__no_truncate BEFORE TRUNCATE ON cera.facility_planning_profile FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT ON cera.planning_input_batch TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cera.planning_container_record TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cera.tariff_rate TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cera.facility_planning_profile TO cera_app;
