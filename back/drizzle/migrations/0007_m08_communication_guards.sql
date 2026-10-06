-- M08 통신 가드 · 캐시 트리거 (docs/24 12.3 · 13 · 14 · 15 · docs/22 rev.2.5 15.5.1 · 15.7)
-- 사람이 쓴 custom migration. 함수는 now() 를 부르지 않는다 — 시각 비교는 행의 값(NEW.started_at 등)으로 한다.

-- send_attempt 결과: NULL → 결과 한 번 · UNKNOWN → SUCCESS(provider_message_id) / RETRYABLE_FAILURE(RECONCILED_NOT_SENT) 한 번(화해만).
-- finished_at 은 한 번 기록 뒤 바꾸지 않는다. 확정 결과는 바꿀 수 없다.
CREATE FUNCTION cera.fn_cera_guard_send_attempt_result() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  IF OLD.result IS NULL THEN
    IF NEW.result IS NULL THEN
      RAISE EXCEPTION 'cera: send_attempt % result columns change only together with the result', OLD.send_attempt_id
        USING ERRCODE = 'CE004';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.result = 'UNKNOWN' THEN
    IF NEW.finished_at IS DISTINCT FROM OLD.finished_at THEN
      RAISE EXCEPTION 'cera: send_attempt % finished_at is recorded once', OLD.send_attempt_id
        USING ERRCODE = 'CE004';
    END IF;
    IF NEW.result = 'SUCCESS' AND NEW.provider_message_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.result = 'RETRYABLE_FAILURE' AND NEW.error_code = 'RECONCILED_NOT_SENT' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'cera: send_attempt % UNKNOWN may only be reconciled to SUCCESS(provider_message_id) or RETRYABLE_FAILURE(RECONCILED_NOT_SENT)', OLD.send_attempt_id
      USING ERRCODE = 'CE004';
  END IF;

  RAISE EXCEPTION 'cera: send_attempt % result % is final', OLD.send_attempt_id, OLD.result
    USING ERRCODE = 'CE004';
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_send_attempt__guard_result BEFORE UPDATE ON cera.send_attempt
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_send_attempt_result();
--> statement-breakpoint

-- send_attempt 삽입: I-9 · I-3 · I-3b + 새 시도 조건(docs/24 12.3).
-- BUSINESS = 유효한 승인 여섯 조건(docs/22 15.5.1)을 NEW.started_at 기준으로 · CV = 승인 없음 + 메시지 지문.
-- 동시 삽입은 UNIQUE(message_id, attempt_no) · U-6 · U-7 이 막는다.
CREATE FUNCTION cera.fn_cera_guard_send_attempt_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  msg record;
  appr record;
  prev_max integer;
BEGIN
  IF NEW.result IS NOT NULL OR NEW.finished_at IS NOT NULL OR NEW.error_code IS NOT NULL
     OR NEW.error_message IS NOT NULL OR NEW.provider_message_id IS NOT NULL THEN
    RAISE EXCEPTION 'cera: a send attempt starts without a result (pre-commit before the external call)'
      USING ERRCODE = 'CE005';
  END IF;

  -- 메시지 행을 잠가 같은 메시지의 시도·결과·무효화 판정을 줄 세운다(삽입 가드가 커밋된 최신 상태를 본다).
  SELECT m.message_kind, m.direction, m.to_address_id, m.content_hash
    INTO msg FROM cera.comm_message m WHERE m.message_id = NEW.message_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW; -- FK 가 거부한다
  END IF;
  IF msg.direction <> 'OUTBOUND' THEN
    RAISE EXCEPTION 'cera: send attempts are only for OUTBOUND messages' USING ERRCODE = 'CE005';
  END IF;

  IF EXISTS (SELECT 1 FROM cera.send_attempt s
             WHERE s.message_id = NEW.message_id AND s.result IN ('SUCCESS', 'PERMANENT_FAILURE')) THEN
    RAISE EXCEPTION 'cera: message % already has a SUCCESS or PERMANENT_FAILURE attempt', NEW.message_id
      USING ERRCODE = 'CE005';
  END IF;

  SELECT coalesce(max(s.attempt_no), 0) INTO prev_max FROM cera.send_attempt s WHERE s.message_id = NEW.message_id;
  IF NEW.attempt_no <> prev_max + 1 THEN
    RAISE EXCEPTION 'cera: attempt_no must be % for message %', prev_max + 1, NEW.message_id USING ERRCODE = 'CE005';
  END IF;

  IF msg.message_kind = 'BUSINESS' THEN
    IF NEW.approval_id IS NULL THEN
      RAISE EXCEPTION 'cera: I-9 a BUSINESS send attempt needs a valid approval' USING ERRCODE = 'CE005';
    END IF;
    SELECT a.approval_id, a.decision, a.expires_at, a.approved_content_hash, a.approved_to_address_id
      INTO appr FROM cera.message_approval a
      WHERE a.approval_id = NEW.approval_id AND a.message_id = NEW.message_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'cera: I-9 approval % is not an approval of message %', NEW.approval_id, NEW.message_id
        USING ERRCODE = 'CE005';
    END IF;
    IF appr.decision <> 'APPROVED' THEN
      RAISE EXCEPTION 'cera: I-9 approval % is %, not APPROVED', appr.approval_id, appr.decision USING ERRCODE = 'CE005';
    END IF;
    IF appr.expires_at IS NOT NULL AND appr.expires_at <= NEW.started_at THEN
      RAISE EXCEPTION 'cera: I-9 approval % expired before the attempt started', appr.approval_id USING ERRCODE = 'CE005';
    END IF;
    IF EXISTS (SELECT 1 FROM cera.message_approval i WHERE i.invalidates_approval_id = appr.approval_id) THEN
      RAISE EXCEPTION 'cera: I-9 approval % has been revoked or invalidated', appr.approval_id USING ERRCODE = 'CE005';
    END IF;
    IF appr.approved_content_hash IS DISTINCT FROM NEW.sent_content_hash THEN
      RAISE EXCEPTION 'cera: I-3 sent content hash differs from the approved content hash' USING ERRCODE = 'CE005';
    END IF;
    -- docs/22 15.7.2: "작성한 내용 ≠ 실제 보낸 내용"은 어느 종류에서도 허용되지 않는다
    IF NEW.sent_content_hash IS DISTINCT FROM msg.content_hash THEN
      RAISE EXCEPTION 'cera: sent content hash differs from the composed message content hash' USING ERRCODE = 'CE005';
    END IF;
    IF appr.approved_to_address_id IS DISTINCT FROM msg.to_address_id THEN
      RAISE EXCEPTION 'cera: I-9 approved recipient differs from the message recipient' USING ERRCODE = 'CE005';
    END IF;
  ELSE
    IF NEW.approval_id IS NOT NULL THEN
      RAISE EXCEPTION 'cera: I-3b a CONTACT_VERIFICATION attempt has no approval' USING ERRCODE = 'CE005';
    END IF;
    IF NEW.sent_content_hash IS DISTINCT FROM msg.content_hash THEN
      RAISE EXCEPTION 'cera: I-3b sent content hash differs from the message content hash' USING ERRCODE = 'CE005';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_send_attempt__guard_insert BEFORE INSERT ON cera.send_attempt
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_send_attempt_insert();
--> statement-breakpoint

-- extraction 검토: PENDING → 종료(ACCEPTED · REJECTED · SUPERSEDED) 한 번.
CREATE FUNCTION cera.fn_cera_guard_extraction_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF OLD.review_status <> 'PENDING' OR NEW.review_status = 'PENDING' THEN
    RAISE EXCEPTION 'cera: extraction % review moves PENDING -> final exactly once', OLD.extraction_id
      USING ERRCODE = 'CE004';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_extraction__guard_review BEFORE UPDATE ON cera.extraction
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_extraction_review();
--> statement-breakpoint

-- message_approval 삽입: I-10(CV 승인 금지) · I-17(무효화 대상은 APPROVED) · 결정 주체 HUMAN(INVALIDATED 는 SYSTEM 허용, AI 는 승인하지 않는다)
-- · 계획 기반(구조화 값이 계획 실행을 출처로 가짐)이면 approved_plan_run_id · 메시지 내용이 있으면 approved_content_ref.
CREATE FUNCTION cera.fn_cera_guard_approval_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  msg record;
  decider text;
  target_decision text;
BEGIN
  SELECT m.message_kind, m.message_content_ref INTO msg FROM cera.comm_message m WHERE m.message_id = NEW.message_id;
  IF NOT FOUND THEN
    RETURN NEW; -- FK 가 거부한다
  END IF;
  IF msg.message_kind = 'CONTACT_VERIFICATION' THEN
    RAISE EXCEPTION 'cera: I-10 CONTACT_VERIFICATION messages are not approved' USING ERRCODE = 'CE005';
  END IF;

  SELECT a.actor_type INTO decider FROM cera.actor a WHERE a.actor_id = NEW.actor_id;
  IF decider IS DISTINCT FROM 'HUMAN' AND NOT (NEW.decision = 'INVALIDATED' AND decider = 'SYSTEM') THEN
    RAISE EXCEPTION 'cera: approval decision % must be made by a HUMAN actor (got %)', NEW.decision, decider
      USING ERRCODE = 'CE005';
  END IF;

  IF NEW.invalidates_approval_id IS NOT NULL THEN
    SELECT a.decision INTO target_decision FROM cera.message_approval a WHERE a.approval_id = NEW.invalidates_approval_id;
    IF target_decision IS DISTINCT FROM 'APPROVED' THEN
      RAISE EXCEPTION 'cera: I-17 only an APPROVED approval can be revoked or invalidated' USING ERRCODE = 'CE005';
    END IF;
  END IF;

  IF NEW.decision = 'APPROVED' THEN
    IF msg.message_content_ref IS NOT NULL AND NEW.approved_content_ref IS NULL THEN
      RAISE EXCEPTION 'cera: an APPROVED decision keeps a copy of the approved content (approved_content_ref)'
        USING ERRCODE = 'CE005';
    END IF;
    IF NEW.approved_plan_run_id IS NULL AND EXISTS (
         SELECT 1 FROM cera.comm_message_structured_field f
         WHERE f.message_id = NEW.message_id AND f.source_run_id IS NOT NULL) THEN
      RAISE EXCEPTION 'cera: a plan-based message approval records approved_plan_run_id' USING ERRCODE = 'CE005';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_message_approval__guard_insert BEFORE INSERT ON cera.message_approval
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_approval_insert();
--> statement-breakpoint

-- 커밋 시: APPROVED 의 구조화 값 사본 = 메시지 구조화 값(docs/22 15.5 규칙 5).
-- + 계획 기반 승인(docs/22 15.5 · docs/19 FR-COM-10 · FR-APV-06): 메시지 값의 source_run_id 는 한 실행뿐이고
--   approved_plan_run_id = 그 실행. source_run_id 가 없는 값만 있으면 계획 무관 승인(approved_plan_run_id 자유).
-- 승인 행 · 사본 행 · 메시지 구조화 값 행 어느 쪽 삽입이든 검사한다(승인 뒤 메시지 값을 더해 어긋나게 하는 경로도 막는다).
CREATE FUNCTION cera.fn_cera_check_approval_copies() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  appr record;
  run_count integer;
  value_run uuid;
BEGIN
  FOR appr IN
    SELECT a.approval_id, a.message_id, a.approved_plan_run_id
      FROM cera.message_approval a
     WHERE a.decision = 'APPROVED'
       AND CASE TG_TABLE_NAME
             WHEN 'comm_message_structured_field' THEN a.message_id = (to_jsonb(NEW) ->> 'message_id')::uuid
             ELSE a.approval_id = (to_jsonb(NEW) ->> 'approval_id')::uuid
           END
  LOOP
  IF EXISTS (
       (SELECT f.field_key, f.value_text, f.value_number, f.unit, f.source_run_id, f.source_question_item_id, f.source_path
          FROM cera.comm_message_structured_field f WHERE f.message_id = appr.message_id)
       EXCEPT
       (SELECT c.field_key, c.approved_value_text, c.approved_value_number, c.approved_unit, c.approved_source_run_id,
               c.approved_source_question_item_id, c.approved_source_path
          FROM cera.message_approval_structured_field c WHERE c.approval_id = appr.approval_id))
     OR EXISTS (
       (SELECT c.field_key, c.approved_value_text, c.approved_value_number, c.approved_unit, c.approved_source_run_id,
               c.approved_source_question_item_id, c.approved_source_path
          FROM cera.message_approval_structured_field c WHERE c.approval_id = appr.approval_id)
       EXCEPT
       (SELECT f.field_key, f.value_text, f.value_number, f.unit, f.source_run_id, f.source_question_item_id, f.source_path
          FROM cera.comm_message_structured_field f WHERE f.message_id = appr.message_id)) THEN
    RAISE EXCEPTION 'cera: approval % structured value copies differ from message %', appr.approval_id, appr.message_id
      USING ERRCODE = 'CE006';
  END IF;
  SELECT count(DISTINCT f.source_run_id), min(f.source_run_id::text)::uuid INTO run_count, value_run
    FROM cera.comm_message_structured_field f
   WHERE f.message_id = appr.message_id AND f.source_run_id IS NOT NULL;
  IF run_count > 1 THEN
    RAISE EXCEPTION 'cera: approval % covers values from % different recovery runs', appr.approval_id, run_count
      USING ERRCODE = 'CE006';
  END IF;
  IF run_count = 1 AND appr.approved_plan_run_id IS DISTINCT FROM value_run THEN
    RAISE EXCEPTION 'cera: approval % approved_plan_run_id must equal the source run % of the message values', appr.approval_id, value_run
      USING ERRCODE = 'CE006';
  END IF;
  END LOOP;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tg_message_approval__check_copies AFTER INSERT ON cera.message_approval
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_check_approval_copies();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tg_message_approval_structured_field__check_copies AFTER INSERT ON cera.message_approval_structured_field
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_check_approval_copies();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tg_comm_message_structured_field__check_copies AFTER INSERT ON cera.comm_message_structured_field
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_check_approval_copies();
--> statement-breakpoint

-- 메시지 자식(구조화 값 · 메시지↔질문): BUSINESS · DRAFTED 일 때만, 질문은 같은 스레드(I-10 규칙 4·5). 수정은 새 메시지.
CREATE FUNCTION cera.fn_cera_guard_message_children_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  msg record;
  question_thread uuid;
BEGIN
  SELECT m.message_kind, m.current_status, m.thread_id INTO msg FROM cera.comm_message m WHERE m.message_id = NEW.message_id;
  IF NOT FOUND THEN
    RETURN NEW; -- FK 가 거부한다
  END IF;
  IF msg.message_kind <> 'BUSINESS' OR msg.current_status IS DISTINCT FROM 'DRAFTED' THEN
    RAISE EXCEPTION 'cera: % rows are added only to a DRAFTED BUSINESS message', TG_TABLE_NAME USING ERRCODE = 'CE005';
  END IF;
  IF TG_TABLE_NAME = 'comm_message_question' THEN
    SELECT q.thread_id INTO question_thread FROM cera.question_item q
      WHERE q.question_item_id = (to_jsonb(NEW) ->> 'question_item_id')::uuid;
    IF FOUND AND question_thread <> msg.thread_id THEN
      RAISE EXCEPTION 'cera: question and message must belong to the same thread' USING ERRCODE = 'CE005';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_comm_message_structured_field__guard_insert BEFORE INSERT ON cera.comm_message_structured_field
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_message_children_insert();
--> statement-breakpoint
CREATE TRIGGER tg_comm_message_question__guard_insert BEFORE INSERT ON cera.comm_message_question
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_message_children_insert();
--> statement-breakpoint

-- 승인 사본: 부모 decision ∈ (APPROVED, REJECTED, REVISION_REQUESTED).
CREATE FUNCTION cera.fn_cera_guard_approval_copy_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_decision text;
BEGIN
  SELECT a.decision INTO parent_decision FROM cera.message_approval a WHERE a.approval_id = NEW.approval_id;
  IF FOUND AND parent_decision NOT IN ('APPROVED', 'REJECTED', 'REVISION_REQUESTED') THEN
    RAISE EXCEPTION 'cera: % approvals carry no structured value copies', parent_decision USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_message_approval_structured_field__guard_insert BEFORE INSERT ON cera.message_approval_structured_field
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_approval_copy_insert();
--> statement-breakpoint

-- 상태 전이 → comm_message.current_status 캐시. INBOUND 메시지에는 전이를 넣을 수 없다(rev.2.5).
CREATE FUNCTION cera.fn_cera_apply_status_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  dir text;
BEGIN
  SELECT m.direction INTO dir FROM cera.comm_message m WHERE m.message_id = NEW.message_id;
  IF dir = 'INBOUND' THEN
    RAISE EXCEPTION 'cera: INBOUND messages have no outbound status lifecycle' USING ERRCODE = 'CE005';
  END IF;
  UPDATE cera.comm_message SET current_status = NEW.status
    WHERE message_id = NEW.message_id AND current_status IS DISTINCT FROM NEW.status;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_message_status_transition__apply AFTER INSERT ON cera.message_status_transition
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_apply_status_transition();
