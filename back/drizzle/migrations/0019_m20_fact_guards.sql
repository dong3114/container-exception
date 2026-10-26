-- M20 사실 파이프라인 가드 (T-093 · docs/05 6.2 · 11.3 · docs/24 22.41)
-- 사람이 쓴 custom migration. M01~M19 는 고치지 않는다. 새 표 · 새 열 없음 — 있는 표(event · extraction · canonical_fact)에 불변식을 DB 에서도 지키게 한다.
-- 함수는 now() 를 부르지 않는다.
--
-- ① 사건: 사람이 한 일은 사람만 기록한다. HUMAN_UI 사건 · VERIFICATION(확인 · 거절 · 확인 취소)은 활성 여부와 무관하게 actor_type = HUMAN 인 행위자만.
--    AI/Agent/시스템 행위자는 CONFIRMED 의 근거를 만들 수 없다. LLM 추출 사건은 OBSERVATION 만(다른 사건을 정정 · 확인할 수 없다).
-- ② 추출 후보 채택: ACCEPTED 로 가는 후보는 LLM 추출 OBSERVATION 사건에 이어져 있어야 한다(사람이 입력한 사건으로 후보를 채택했다고 하지 못한다).
-- ③ 정식 사실: canonical_fact 의 CONFIRMED 는 같은 좌표 · 같은 값의 사건 중 사람이 입력했거나 사람이 CONFIRM 한 것(HUMAN_VERIFICATION),
--    또는 권한자 시스템 사건(AUTHORITATIVE_SYSTEM)이 있을 때만. 정책 근거(POLICY_EVIDENCE)는 정책이 비어 있어 아직 쓸 수 없다.

CREATE FUNCTION cera.fn_cera_guard_event_authority() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  enterer text;
BEGIN
  IF NEW.source_type = 'HUMAN_UI' OR NEW.event_class = 'VERIFICATION' THEN
    SELECT a.actor_type INTO enterer FROM cera.actor a WHERE a.actor_id = NEW.entered_by_actor_id;
    IF NEW.entered_by_actor_id IS NULL OR enterer IS DISTINCT FROM 'HUMAN' THEN
      RAISE EXCEPTION 'cera: human input and verification events are recorded by a HUMAN actor (got %)', COALESCE(enterer, 'none')
        USING ERRCODE = 'CE005';
    END IF;
  END IF;
  IF NEW.extraction_method = 'LLM_EXTRACTED' AND NEW.event_class <> 'OBSERVATION' THEN
    RAISE EXCEPTION 'cera: an LLM-extracted event is an OBSERVATION only (it cannot correct or verify)' USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_event__guard_authority BEFORE INSERT ON cera.event
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_event_authority();
--> statement-breakpoint

CREATE FUNCTION cera.fn_cera_guard_extraction_accept() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  linked record;
BEGIN
  IF NEW.review_status = 'ACCEPTED' AND OLD.review_status IS DISTINCT FROM 'ACCEPTED' THEN
    SELECT e.event_class, e.extraction_method INTO linked FROM cera.event e WHERE e.event_id = NEW.created_event_id;
    IF NOT FOUND OR linked.event_class <> 'OBSERVATION' OR linked.extraction_method <> 'LLM_EXTRACTED' THEN
      RAISE EXCEPTION 'cera: an accepted extraction must point to the LLM-extracted OBSERVATION it became' USING ERRCODE = 'CE005';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_extraction__guard_accept BEFORE UPDATE ON cera.extraction
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_extraction_accept();
--> statement-breakpoint

CREATE FUNCTION cera.fn_cera_guard_canonical_confirmed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  backed boolean;
BEGIN
  IF NEW.value_status <> 'CONFIRMED' THEN
    RETURN NEW;
  END IF;
  IF NEW.verification_basis = 'HUMAN_VERIFICATION' THEN
    SELECT EXISTS (
      SELECT 1
        FROM cera.event e
        JOIN cera.event_entity_link l ON l.event_id = e.event_id AND l.link_role = 'SUBJECT'
       WHERE l.entity_type = NEW.entity_type AND l.entity_id = NEW.entity_id
         AND e.fact_key = NEW.fact_key
         AND e.applicability_scope_type = NEW.applicability_scope_type AND e.applicability_scope_ref = NEW.applicability_scope_ref
         AND e.is_simulated = NEW.is_simulated
         AND e.event_class IN ('OBSERVATION', 'CORRECTION')
         AND e.value_number IS NOT DISTINCT FROM NEW.value_number
         AND (
           e.source_type = 'HUMAN_UI'
           OR EXISTS (
             SELECT 1
               FROM cera.event_verification_target t
               JOIN cera.event v ON v.event_id = t.verification_event_id
              WHERE t.target_event_id = e.event_id AND t.target_role = 'TARGET' AND v.verification_action = 'CONFIRM')
         )
    ) INTO backed;
  ELSIF NEW.verification_basis = 'AUTHORITATIVE_SYSTEM' THEN
    SELECT EXISTS (
      SELECT 1
        FROM cera.event e
        JOIN cera.event_entity_link l ON l.event_id = e.event_id AND l.link_role = 'SUBJECT'
       WHERE l.entity_type = NEW.entity_type AND l.entity_id = NEW.entity_id
         AND e.fact_key = NEW.fact_key
         AND e.applicability_scope_type = NEW.applicability_scope_type AND e.applicability_scope_ref = NEW.applicability_scope_ref
         AND e.is_simulated = NEW.is_simulated
         AND e.source_type = 'PARTNER_SYSTEM'
         AND e.value_number IS NOT DISTINCT FROM NEW.value_number
    ) INTO backed;
  ELSE
    backed := false;
  END IF;
  IF NOT backed THEN
    RAISE EXCEPTION 'cera: a CONFIRMED canonical fact needs a human-entered / human-confirmed (or authoritative system) event with the same value'
      USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_canonical_fact__guard_confirmed BEFORE INSERT OR UPDATE ON cera.canonical_fact
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_canonical_confirmed();
