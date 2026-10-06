-- M09 사건 지연 트리거 · 다형 가드 · 사람 처리 가드 (docs/24 12.3 · docs/22 11.2 규칙 5 · 11.2a · 11.3 · I-8 · I-21 · I-26)
-- 사람이 쓴 custom migration. 함수는 now() 를 부르지 않는다.

-- CORRECTION: 원 사건과 fact_kind 같음(주체 일치는 커밋 시 지연 검사).
CREATE FUNCTION cera.fn_cera_guard_event_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  original_kind text;
BEGIN
  IF NEW.event_class = 'CORRECTION' THEN
    SELECT e.fact_kind INTO original_kind FROM cera.event e WHERE e.event_id = NEW.supersedes_event_id;
    IF FOUND AND original_kind IS DISTINCT FROM NEW.fact_kind THEN
      RAISE EXCEPTION 'cera: a CORRECTION keeps the fact_kind of the event it supersedes' USING ERRCODE = 'CE005';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_event__guard_insert BEFORE INSERT ON cera.event
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_event_insert();
--> statement-breakpoint

-- 커밋 시 사건 링크 검사: SUBJECT 정확히 1건(I-8) · VERIFICATION 은 TARGET ≥ 1, 그 밖은 대상 0건(I-21)
-- · 대상 부류 ≠ VERIFICATION · OVERRULED 는 REQUEST_RESOLUTION 에서만 · I-26 좌표 동일 · CORRECTION 주체 = 원 사건 주체.
CREATE FUNCTION cera.fn_cera_check_event_links() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  eid uuid;
  ev record;
  subj record;
  subject_count integer;
  original_subject record;
BEGIN
  IF TG_TABLE_NAME = 'event_verification_target' THEN
    eid := (to_jsonb(NEW) ->> 'verification_event_id')::uuid;
  ELSE
    eid := (to_jsonb(NEW) ->> 'event_id')::uuid;
  END IF;

  SELECT e.event_id, e.event_class, e.verification_method, e.supersedes_event_id,
         e.applicability_scope_type, e.applicability_scope_ref
    INTO ev FROM cera.event e WHERE e.event_id = eid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO subject_count FROM cera.event_entity_link l WHERE l.event_id = eid AND l.link_role = 'SUBJECT';
  IF subject_count <> 1 THEN
    RAISE EXCEPTION 'cera: I-8 event % must have exactly one SUBJECT link (has %)', eid, subject_count
      USING ERRCODE = 'CE006';
  END IF;
  SELECT l.entity_type, l.entity_id INTO subj FROM cera.event_entity_link l WHERE l.event_id = eid AND l.link_role = 'SUBJECT';

  IF ev.event_class = 'VERIFICATION' THEN
    IF NOT EXISTS (SELECT 1 FROM cera.event_verification_target t
                   WHERE t.verification_event_id = eid AND t.target_role = 'TARGET') THEN
      RAISE EXCEPTION 'cera: I-21 VERIFICATION event % needs at least one TARGET', eid USING ERRCODE = 'CE006';
    END IF;
    IF EXISTS (SELECT 1 FROM cera.event_verification_target t JOIN cera.event te ON te.event_id = t.target_event_id
               WHERE t.verification_event_id = eid AND te.event_class = 'VERIFICATION') THEN
      RAISE EXCEPTION 'cera: a VERIFICATION event cannot target another VERIFICATION event' USING ERRCODE = 'CE006';
    END IF;
    IF ev.verification_method <> 'REQUEST_RESOLUTION' AND EXISTS (
         SELECT 1 FROM cera.event_verification_target t WHERE t.verification_event_id = eid AND t.target_role = 'OVERRULED') THEN
      RAISE EXCEPTION 'cera: OVERRULED targets exist only for REQUEST_RESOLUTION' USING ERRCODE = 'CE006';
    END IF;
    -- I-26: 모든 대상의 좌표(SUBJECT + fact_key + 범위)가 하나이고, 확인 사건 자신의 SUBJECT·범위와 같다
    IF EXISTS (
         SELECT 1
           FROM cera.event_verification_target t
           JOIN cera.event te ON te.event_id = t.target_event_id
           LEFT JOIN cera.event_entity_link tl ON tl.event_id = te.event_id AND tl.link_role = 'SUBJECT'
          WHERE t.verification_event_id = eid
            AND (tl.entity_type IS DISTINCT FROM subj.entity_type
                 OR tl.entity_id IS DISTINCT FROM subj.entity_id
                 OR te.applicability_scope_type <> ev.applicability_scope_type
                 OR te.applicability_scope_ref <> ev.applicability_scope_ref))
       OR (SELECT count(DISTINCT te.fact_key)
             FROM cera.event_verification_target t JOIN cera.event te ON te.event_id = t.target_event_id
            WHERE t.verification_event_id = eid) > 1 THEN
      RAISE EXCEPTION 'cera: I-26 all targets of VERIFICATION event % must share one fact coordinate with it', eid
        USING ERRCODE = 'CE006';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM cera.event_verification_target t WHERE t.verification_event_id = eid) THEN
      RAISE EXCEPTION 'cera: I-21 only VERIFICATION events have verification targets' USING ERRCODE = 'CE006';
    END IF;
    IF ev.event_class = 'CORRECTION' THEN
      SELECT l.entity_type, l.entity_id INTO original_subject
        FROM cera.event_entity_link l WHERE l.event_id = ev.supersedes_event_id AND l.link_role = 'SUBJECT';
      IF original_subject.entity_type IS DISTINCT FROM subj.entity_type
         OR original_subject.entity_id IS DISTINCT FROM subj.entity_id THEN
        RAISE EXCEPTION 'cera: a CORRECTION keeps the SUBJECT of the event it supersedes' USING ERRCODE = 'CE006';
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tg_event__check_links AFTER INSERT ON cera.event
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_check_event_links();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tg_event_entity_link__check_links AFTER INSERT ON cera.event_entity_link
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_check_event_links();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tg_event_verification_target__check_links AFTER INSERT ON cera.event_verification_target
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_check_event_links();
--> statement-breakpoint

-- 다형 대상 존재 검사. P0 에 표가 없는 CONTAINER · BL · VESSEL_CALL 은 Slice 1 에서 거부한다.
CREATE FUNCTION cera.fn_cera_guard_entity_link_insert() RETURNS trigger
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
    ELSE
      RAISE EXCEPTION 'cera: entity type % has no table in Slice 1', NEW.entity_type USING ERRCODE = 'CE005';
  END CASE;
  IF NOT found_target THEN
    RAISE EXCEPTION 'cera: % % does not exist', NEW.entity_type, NEW.entity_id USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_event_entity_link__guard_insert BEFORE INSERT ON cera.event_entity_link
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_entity_link_insert();
--> statement-breakpoint

-- 확인 요청 처리 기록은 사람의 기록이다.
CREATE FUNCTION cera.fn_cera_guard_handling_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  handler text;
BEGIN
  SELECT a.actor_type INTO handler FROM cera.actor a WHERE a.actor_id = NEW.actor_id;
  IF FOUND AND handler <> 'HUMAN' THEN
    RAISE EXCEPTION 'cera: verification request handling is recorded by a HUMAN actor (got %)', handler
      USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_verification_request_handling__guard_insert BEFORE INSERT ON cera.verification_request_handling
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_handling_insert();
