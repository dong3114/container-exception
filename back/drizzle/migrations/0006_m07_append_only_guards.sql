-- M07 공통 불변식 함수 · append-only · TRUNCATE · 열 가드 · 한 번 채움 (docs/24 12.1 B층 · 12.3)
-- 사람이 쓴 custom migration. 함수는 now() 를 부르지 않는다(docs/24 5절).
-- 전용 SQLSTATE(앱이 구분한다 — back/src/db/sqlstate.ts):
--   CE001 불변 기록 변경 · CE002 허용 밖 열 변경 · CE003 한 번 채움 위반 · CE004 허용 밖 상태 전이
--   CE005 삽입 가드 위반 · CE006 지연(커밋 시) 불변식 위반

CREATE FUNCTION cera.fn_cera_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'cera: % on append-only table %.% is not allowed', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'CE001';
END
$$;
--> statement-breakpoint
CREATE FUNCTION cera.fn_cera_reject_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'cera: DELETE on %.% is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'CE001';
END
$$;
--> statement-breakpoint
CREATE FUNCTION cera.fn_cera_reject_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'cera: TRUNCATE on %.% is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'CE001';
END
$$;
--> statement-breakpoint
-- 인자 = 바뀔 수 있는 열 목록. 목록 밖 열이 바뀌면 거부한다.
-- `@열` = 캐시 열: 다른 트리거 안에서만(pg_trigger_depth() > 1) 바뀔 수 있다 — 정본 행 삽입 없이 캐시만 바꾸는 경로를 막는다.
CREATE FUNCTION cera.fn_cera_guard_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  allowed text[] := ARRAY(SELECT ltrim(a, '@') FROM unnest(TG_ARGV) AS a);
  cache_col text;
BEGIN
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'cera: only (%) may change on %.%', array_to_string(allowed, ', '), TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'CE002';
  END IF;
  FOR cache_col IN SELECT ltrim(a, '@') FROM unnest(TG_ARGV) AS a WHERE a LIKE '@%' LOOP
    IF (to_jsonb(NEW) -> cache_col) IS DISTINCT FROM (to_jsonb(OLD) -> cache_col) AND pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'cera: %.%.% is a cache maintained by its record trigger', TG_TABLE_SCHEMA, TG_TABLE_NAME, cache_col
        USING ERRCODE = 'CE002';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- 인자 = 열 이름 하나. `BEFORE UPDATE OF <열>` 로 붙인다 — 그 열이 SET 목록에 있을 때만 돈다.
-- NULL → 값 한 번. 이미 값이 있으면 같은 값 재기록도 거부한다(docs/24 12.3).
CREATE FUNCTION cera.fn_cera_guard_one_time_fill() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col text := TG_ARGV[0];
  old_value jsonb := to_jsonb(OLD) -> col;
BEGIN
  IF old_value IS NOT NULL AND old_value <> 'null'::jsonb THEN
    RAISE EXCEPTION 'cera: %.%.% can be filled only once', TG_TABLE_SCHEMA, TG_TABLE_NAME, col
      USING ERRCODE = 'CE003';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- APPEND_ONLY 14표: UPDATE · DELETE 거부
CREATE TRIGGER tg_planning_snapshot__append_only BEFORE UPDATE OR DELETE ON cera.planning_snapshot
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_recovery_run__append_only BEFORE UPDATE OR DELETE ON cera.recovery_run
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_comm_message_structured_field__append_only BEFORE UPDATE OR DELETE ON cera.comm_message_structured_field
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_comm_message_question__append_only BEFORE UPDATE OR DELETE ON cera.comm_message_question
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_message_approval__append_only BEFORE UPDATE OR DELETE ON cera.message_approval
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_message_approval_structured_field__append_only BEFORE UPDATE OR DELETE ON cera.message_approval_structured_field
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_message_status_transition__append_only BEFORE UPDATE OR DELETE ON cera.message_status_transition
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_raw_input__append_only BEFORE UPDATE OR DELETE ON cera.raw_input
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_event__append_only BEFORE UPDATE OR DELETE ON cera.event
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_event_entity_link__append_only BEFORE UPDATE OR DELETE ON cera.event_entity_link
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_event_verification_target__append_only BEFORE UPDATE OR DELETE ON cera.event_verification_target
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_verification_request_handling__append_only BEFORE UPDATE OR DELETE ON cera.verification_request_handling
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_audit_log__append_only BEFORE UPDATE OR DELETE ON cera.audit_log
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_system_error__append_only BEFORE UPDATE OR DELETE ON cera.system_error
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint

-- 제어된 갱신 5표: DELETE 거부
CREATE TRIGGER tg_send_attempt__no_delete BEFORE DELETE ON cera.send_attempt
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_extraction__no_delete BEFORE DELETE ON cera.extraction
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_comm_message__no_delete BEFORE DELETE ON cera.comm_message
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_comm_thread__no_delete BEFORE DELETE ON cera.comm_thread
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_question_item__no_delete BEFORE DELETE ON cera.question_item
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint

-- 열 가드(바뀔 수 있는 열만 인자로)
CREATE TRIGGER tg_comm_message__guard_columns BEFORE UPDATE ON cera.comm_message
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('@current_status', 'current_approval_id', 'sent_at');
--> statement-breakpoint
CREATE TRIGGER tg_comm_thread__guard_columns BEFORE UPDATE ON cera.comm_thread
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('thread_status', 'last_activity_at', 'external_thread_id');
--> statement-breakpoint
CREATE TRIGGER tg_question_item__guard_columns BEFORE UPDATE ON cera.question_item
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('question_status');
--> statement-breakpoint
CREATE TRIGGER tg_send_attempt__guard_columns BEFORE UPDATE ON cera.send_attempt
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('finished_at', 'result', 'error_code', 'error_message', 'provider_message_id');
--> statement-breakpoint
CREATE TRIGGER tg_extraction__guard_columns BEFORE UPDATE ON cera.extraction
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('review_status', 'reviewed_by_actor_id', 'reviewed_at', 'created_event_id');
--> statement-breakpoint
-- 마스터 중 유일한 열 가드(docs/24 12.1 예외 · 22.2): actor_type 은 승인 · 확인 처리 가드가 믿는 권한 속성이다.
-- 앱 역할이 actor_type 을 HUMAN 으로 바꿔 사람 승인 가드를 우회하지 못하게 한다. display_name · is_active 는 그대로 바뀐다.
CREATE TRIGGER tg_actor__guard_columns BEFORE UPDATE ON cera.actor
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('display_name', 'is_active');
--> statement-breakpoint

-- 한 번 채움(rev.2.5 — F-3 · F-4)
CREATE TRIGGER tg_comm_message__sent_at_once BEFORE UPDATE OF sent_at ON cera.comm_message
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_one_time_fill('sent_at');
--> statement-breakpoint
CREATE TRIGGER tg_comm_thread__external_thread_id_once BEFORE UPDATE OF external_thread_id ON cera.comm_thread
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_one_time_fill('external_thread_id');
--> statement-breakpoint

-- TRUNCATE 거부: 재생성 3표(canonical_fact · conflict · verification_request)를 뺀 26표
CREATE TRIGGER tg_scenario__no_truncate BEFORE TRUNCATE ON cera.scenario FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_actor__no_truncate BEFORE TRUNCATE ON cera.actor FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_audit_log__no_truncate BEFORE TRUNCATE ON cera.audit_log FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_system_error__no_truncate BEFORE TRUNCATE ON cera.system_error FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_counterparty__no_truncate BEFORE TRUNCATE ON cera.counterparty FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_counterparty_contact__no_truncate BEFORE TRUNCATE ON cera.counterparty_contact FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_contact_channel_address__no_truncate BEFORE TRUNCATE ON cera.contact_channel_address FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_facility__no_truncate BEFORE TRUNCATE ON cera.facility FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_truck_pool__no_truncate BEFORE TRUNCATE ON cera.truck_pool FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_planning_snapshot__no_truncate BEFORE TRUNCATE ON cera.planning_snapshot FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_recovery_run__no_truncate BEFORE TRUNCATE ON cera.recovery_run FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_comm_thread__no_truncate BEFORE TRUNCATE ON cera.comm_thread FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_question_item__no_truncate BEFORE TRUNCATE ON cera.question_item FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_comm_message__no_truncate BEFORE TRUNCATE ON cera.comm_message FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_comm_message_structured_field__no_truncate BEFORE TRUNCATE ON cera.comm_message_structured_field FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_comm_message_question__no_truncate BEFORE TRUNCATE ON cera.comm_message_question FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_message_approval__no_truncate BEFORE TRUNCATE ON cera.message_approval FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_message_approval_structured_field__no_truncate BEFORE TRUNCATE ON cera.message_approval_structured_field FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_send_attempt__no_truncate BEFORE TRUNCATE ON cera.send_attempt FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_message_status_transition__no_truncate BEFORE TRUNCATE ON cera.message_status_transition FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_raw_input__no_truncate BEFORE TRUNCATE ON cera.raw_input FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_extraction__no_truncate BEFORE TRUNCATE ON cera.extraction FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_event__no_truncate BEFORE TRUNCATE ON cera.event FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_event_entity_link__no_truncate BEFORE TRUNCATE ON cera.event_entity_link FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_event_verification_target__no_truncate BEFORE TRUNCATE ON cera.event_verification_target FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint
CREATE TRIGGER tg_verification_request_handling__no_truncate BEFORE TRUNCATE ON cera.verification_request_handling FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
