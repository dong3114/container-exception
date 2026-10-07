-- M13 보내는 메시지 생애주기 가드 (T-090 U5 · docs/18 E.1 · docs/22 15.8 · 15.8.1 · docs/24 14절)
-- 사람이 쓴 custom migration. M01~M12 는 고치지 않는다. 함수는 now() 를 부르지 않는다 — 시각 비교는 NEW.occurred_at 으로 한다.
--
-- 왜(T-089 기술 부채 ②): 상태 전이 순서를 앱만 지키고 있었다. 발송이 생기면서 "승인 없이 발송 대기" · "성공 시도 없이 발송 완료" ·
-- "보낸 메시지를 다시 초안으로" 같은 전이가 DB 에서 막혀야 한다. 상태 코드는 늘리지 않는다(15.8.1).
--
-- 허용 전이(지금 상태 → 새 상태). 같은 상태 반복은 DRAFTED(첫 기록) · APPROVED(재승인 이력) · REPLIED(회신 여러 통)만.
--   DRAFTED          → DRAFTED · PENDING_APPROVAL · CLOSED(수정본으로 대체)
--   PENDING_APPROVAL → APPROVED · REJECTED · CLOSED
--   APPROVED         → APPROVED · QUEUED(발송 요청) · CLOSED
--   REJECTED         → CLOSED
--   QUEUED           → SENT · DELIVERY_FAILED · APPROVED(발송 직전 정책 거부로 대기 해제 — 재시도 금지, 사람이 사유를 보고 다시 요청)
--   SENT             → REPLIED · DELIVERY_FAILED(반송 — 15.8.1) · CLOSED
--   REPLIED          → REPLIED · CLOSED
--   DELIVERY_FAILED  → CLOSED
--   CLOSED           → (없음)
-- 추가 조건: BUSINESS 의 QUEUED 는 그 시각에 유효한 승인(같은 지문 · 같은 수신자 · 만료 전 · 무효화 안 됨)이 있어야 한다 ·
--           SENT 는 그 메시지의 SUCCESS 발송 시도가 있어야 한다.
-- INBOUND 는 M08 의 AFTER 트리거가 거부한다(여기서는 건드리지 않는다).

CREATE FUNCTION cera.fn_cera_guard_status_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  msg record;
  allowed boolean;
BEGIN
  -- 같은 메시지의 전이 · 승인 결정 · 발송 시도를 줄 세운다(M08 · M12 와 같은 행 잠금).
  SELECT m.direction, m.message_kind, m.current_status, m.content_hash, m.to_address_id
    INTO msg FROM cera.comm_message m WHERE m.message_id = NEW.message_id FOR UPDATE;
  IF NOT FOUND OR msg.direction <> 'OUTBOUND' THEN
    RETURN NEW; -- FK · M08 이 거부한다
  END IF;

  allowed := CASE msg.current_status
    WHEN 'DRAFTED' THEN NEW.status IN ('DRAFTED', 'PENDING_APPROVAL', 'CLOSED')
    WHEN 'PENDING_APPROVAL' THEN NEW.status IN ('APPROVED', 'REJECTED', 'CLOSED')
    WHEN 'APPROVED' THEN NEW.status IN ('APPROVED', 'QUEUED', 'CLOSED')
    WHEN 'REJECTED' THEN NEW.status IN ('CLOSED')
    WHEN 'QUEUED' THEN NEW.status IN ('SENT', 'DELIVERY_FAILED', 'APPROVED')
    WHEN 'SENT' THEN NEW.status IN ('REPLIED', 'DELIVERY_FAILED', 'CLOSED')
    WHEN 'REPLIED' THEN NEW.status IN ('REPLIED', 'CLOSED')
    WHEN 'DELIVERY_FAILED' THEN NEW.status IN ('CLOSED')
    ELSE false
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'cera: message % cannot move from % to %', NEW.message_id, msg.current_status, NEW.status
      USING ERRCODE = 'CE005';
  END IF;

  IF NEW.status = 'QUEUED' AND msg.message_kind = 'BUSINESS' AND NOT EXISTS (
       SELECT 1 FROM cera.message_approval a
        WHERE a.message_id = NEW.message_id AND a.decision = 'APPROVED'
          AND (a.expires_at IS NULL OR a.expires_at > NEW.occurred_at)
          AND a.approved_content_hash = msg.content_hash
          AND a.approved_to_address_id = msg.to_address_id
          AND NOT EXISTS (SELECT 1 FROM cera.message_approval i WHERE i.invalidates_approval_id = a.approval_id)) THEN
    RAISE EXCEPTION 'cera: message % has no valid approval to queue for sending', NEW.message_id USING ERRCODE = 'CE005';
  END IF;

  IF NEW.status = 'SENT' AND NOT EXISTS (
       SELECT 1 FROM cera.send_attempt s WHERE s.message_id = NEW.message_id AND s.result = 'SUCCESS') THEN
    RAISE EXCEPTION 'cera: message % has no successful send attempt', NEW.message_id USING ERRCODE = 'CE005';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_message_status_transition__guard_insert BEFORE INSERT ON cera.message_status_transition
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_status_transition();
