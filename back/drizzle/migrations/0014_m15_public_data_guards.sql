-- M15 공공데이터 표 가드 · 권한 (T-102 · docs/24 22.30 ~ 22.35 · docs/22 rev.2.6)
-- 사람이 쓴 custom migration. M01~M14 는 고치지 않는다. 함수는 now() 를 부르지 않는다.
--
-- 1. 호출 원장 · 외부 식별자 · 컨테이너-B/L 연결 = append-only(정정은 새 행 · 사건)
-- 2. 개체 마스터(vessel_call · bl · container) = 삭제 없음 · 바뀔 수 있는 열만 바뀐다(식별 열은 불변)
-- 3. 사건 → 개체 링크의 존재 검사가 CONTAINER · BL · VESSEL_CALL 을 받는다(M09 함수를 같은 이름으로 교체 — 다른 종류는 그대로)
-- 4. 외부 식별자의 다형 소유자 존재 검사
-- 5. cera_app 권한

CREATE TRIGGER tg_public_data_fetch__append_only BEFORE UPDATE OR DELETE ON cera.public_data_fetch
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_external_identifier__append_only BEFORE UPDATE OR DELETE ON cera.external_identifier
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_container_bl__append_only BEFORE UPDATE OR DELETE ON cera.container_bl
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_public_data_fetch__no_truncate BEFORE TRUNCATE ON cera.public_data_fetch
  FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

CREATE TRIGGER tg_vessel_call__no_delete BEFORE DELETE ON cera.vessel_call
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_bl__no_delete BEFORE DELETE ON cera.bl
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_container__no_delete BEFORE DELETE ON cera.container
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
-- 선명은 신고마다 고쳐질 수 있다. 입항 건 키(항만 · 연도 · 횟수 · 호출부호)는 불변
CREATE TRIGGER tg_vessel_call__guard_columns BEFORE UPDATE ON cera.vessel_call
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('vessel_name', 'is_active');
--> statement-breakpoint
CREATE TRIGGER tg_bl__guard_columns BEFORE UPDATE ON cera.bl
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('carrier_counterparty_id');
--> statement-breakpoint
-- 같은 컨테이너가 다음 항차에 다시 오면 현재 입항 건이 바뀐다. 이력은 VESSEL_CALL_LINKED 사건에 있다
CREATE TRIGGER tg_container__guard_columns BEFORE UPDATE ON cera.container
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('size_type', 'vessel_call_id', 'is_active');
--> statement-breakpoint

CREATE OR REPLACE FUNCTION cera.fn_cera_guard_entity_link_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  found_target boolean;
BEGIN
  CASE NEW.entity_type
    WHEN 'FACILITY' THEN
      found_target := EXISTS (SELECT 1 FROM cera.facility f WHERE f.facility_id = NEW.entity_id);
    WHEN 'COUNTERPARTY' THEN
      found_target := EXISTS (SELECT 1 FROM cera.counterparty c WHERE c.counterparty_id = NEW.entity_id);
    WHEN 'TRUCK_POOL' THEN
      found_target := EXISTS (SELECT 1 FROM cera.truck_pool p WHERE p.truck_pool_id = NEW.entity_id);
    WHEN 'CONTAINER' THEN
      found_target := EXISTS (SELECT 1 FROM cera.container c WHERE c.container_id = NEW.entity_id);
    WHEN 'BL' THEN
      found_target := EXISTS (SELECT 1 FROM cera.bl b WHERE b.bl_id = NEW.entity_id);
    WHEN 'VESSEL_CALL' THEN
      found_target := EXISTS (SELECT 1 FROM cera.vessel_call v WHERE v.vessel_call_id = NEW.entity_id);
    ELSE
      RAISE EXCEPTION 'cera: entity type % has no table', NEW.entity_type USING ERRCODE = 'CE005';
  END CASE;
  IF NOT found_target THEN
    RAISE EXCEPTION 'cera: % % does not exist', NEW.entity_type, NEW.entity_id USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE FUNCTION cera.fn_cera_guard_external_identifier_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  found_owner boolean;
BEGIN
  CASE NEW.owner_type
    WHEN 'CONTAINER' THEN
      found_owner := EXISTS (SELECT 1 FROM cera.container c WHERE c.container_id = NEW.owner_id);
    WHEN 'BL' THEN
      found_owner := EXISTS (SELECT 1 FROM cera.bl b WHERE b.bl_id = NEW.owner_id);
    WHEN 'VESSEL_CALL' THEN
      found_owner := EXISTS (SELECT 1 FROM cera.vessel_call v WHERE v.vessel_call_id = NEW.owner_id);
    ELSE
      found_owner := false; -- CHECK 가 먼저 거부한다
  END CASE;
  IF NOT found_owner THEN
    RAISE EXCEPTION 'cera: external identifier owner % % does not exist', NEW.owner_type, NEW.owner_id USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_external_identifier__guard_insert BEFORE INSERT ON cera.external_identifier
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_external_identifier_insert();
--> statement-breakpoint

-- APPEND_ONLY 3표: SELECT · INSERT
GRANT SELECT, INSERT ON cera.public_data_fetch, cera.external_identifier, cera.container_bl TO cera_app;
--> statement-breakpoint
-- 개체 마스터 3표: SELECT · INSERT · UPDATE (DELETE 없음 — 비활성화)
GRANT SELECT, INSERT, UPDATE ON cera.vessel_call, cera.bl, cera.container TO cera_app;
