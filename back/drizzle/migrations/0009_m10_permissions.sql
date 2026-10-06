-- M10 스키마 권한 · 표 단위 GRANT (docs/24 12.2 C층)
-- 역할(cera_owner · cera_app)은 환경 준비 단계(infra/local/postgres-init)가 만든다. migration 은 GRANT 만 한다.
-- 열 단위 GRANT 는 쓰지 않는다 — 어느 열이 바뀔 수 있는지는 M07·M08 가드 트리거가 정한다.
-- cera_app 에는 TRUNCATE · TRIGGER · REFERENCES · DDL 이 없다. migration 이력 스키마(cera_meta)에는 접근하지 않는다.

REVOKE ALL ON SCHEMA cera FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA cera TO cera_app;
--> statement-breakpoint

-- APPEND_ONLY 14표: SELECT · INSERT
GRANT SELECT, INSERT ON
  cera.planning_snapshot, cera.recovery_run, cera.comm_message_structured_field, cera.comm_message_question,
  cera.message_approval, cera.message_approval_structured_field, cera.message_status_transition, cera.raw_input,
  cera.event, cera.event_entity_link, cera.event_verification_target, cera.verification_request_handling,
  cera.audit_log, cera.system_error
TO cera_app;
--> statement-breakpoint

-- 한 번 전이 · 제어된 갱신 5표: SELECT · INSERT · UPDATE (열·전이는 트리거가 제한)
GRANT SELECT, INSERT, UPDATE ON
  cera.send_attempt, cera.extraction, cera.comm_message, cera.comm_thread, cera.question_item
TO cera_app;
--> statement-breakpoint

-- 등록부 마스터 7표: SELECT · INSERT · UPDATE (DELETE 없음 — 비활성화)
GRANT SELECT, INSERT, UPDATE ON
  cera.scenario, cera.actor, cera.counterparty, cera.counterparty_contact, cera.contact_channel_address,
  cera.facility, cera.truck_pool
TO cera_app;
--> statement-breakpoint

-- 재생성 3표: SELECT · INSERT · UPDATE · DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON
  cera.canonical_fact, cera.conflict, cera.verification_request
TO cera_app;
