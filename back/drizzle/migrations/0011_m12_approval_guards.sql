-- M12 승인 결정 가드 (T-089 U4 · docs/22 15.5 · 15.5.1 · docs/19 FR-APV-01~12 · docs/24 12.3)
-- 사람이 쓴 custom migration. M01~M11 은 고치지 않는다. 함수는 now() 를 부르지 않는다 — 시각 비교는 NEW.decided_at 으로 한다.
--
-- 왜: M08 은 승인 행 하나의 모양(주체 HUMAN · 사본 · 계획 실행)을 지킨다. U4 가 승인 흐름을 열면서 **메시지 단위** 불변식이
-- 필요해졌다 — 앱 코드로만 흉내 내지 않고 DB 가 지킨다(ADR-034).
--   ① 같은 메시지의 결정은 줄을 선다(메시지 행 FOR UPDATE) — 동시에 두 승인이 와도 하나만 산다
--   ② APPROVED: 메시지가 승인 대기(PENDING_APPROVAL) 또는 재승인 가능(APPROVED)이고, 승인 지문 = 메시지 지문(FR-APV-02),
--      그 시각에 살아 있는 승인이 없어야 한다(FR-APV-10 — 같은 메시지의 유효한 승인은 하나)
--   ③ 계획 기반 APPROVED: 근거 실행이 이미 새 실행으로 교체됐으면 거부(FR-APV-06). 교체 쪽과 같은 advisory lock 으로 줄 세운다
--   ④ REJECTED · REVISION_REQUESTED: 승인 대기 메시지에만
--   ⑤ REVOKED · INVALIDATED: 이미 나갔거나 나가는 중(성공 · 미확정 시도)인 메시지는 취소할 수 없다(FR-APV-08 · 12)

-- 계획 실행 단위 잠금(트랜잭션 끝까지). 승인 가드와 계획 교체(앱 PlanSupersessionService)가 같은 키를 쓴다.
-- recovery_run 은 앱 역할에 UPDATE 가 없어 행 잠금(FOR SHARE)을 쓸 수 없다 — advisory lock 으로 대신한다.
CREATE FUNCTION cera.fn_cera_lock_plan_run(run_id uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('cera.plan_run:' || run_id::text, 0));
$$;
--> statement-breakpoint

CREATE FUNCTION cera.fn_cera_guard_approval_decision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  msg record;
BEGIN
  -- ① 같은 메시지의 결정 · 발송 시도 삽입(M08 도 이 행을 잠근다)을 줄 세운다. 잠근 뒤의 문장은 커밋된 최신 행을 본다.
  SELECT m.current_status, m.content_hash, m.to_address_id
    INTO msg FROM cera.comm_message m WHERE m.message_id = NEW.message_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW; -- FK 가 거부한다
  END IF;

  IF NEW.decision = 'APPROVED' THEN
    -- ②
    IF msg.current_status IS DISTINCT FROM 'PENDING_APPROVAL' AND msg.current_status IS DISTINCT FROM 'APPROVED' THEN
      RAISE EXCEPTION 'cera: message % is %, not awaiting approval', NEW.message_id, msg.current_status USING ERRCODE = 'CE005';
    END IF;
    IF NEW.approved_content_hash IS DISTINCT FROM msg.content_hash THEN
      RAISE EXCEPTION 'cera: the approved content hash differs from the message content hash' USING ERRCODE = 'CE005';
    END IF;
    IF EXISTS (
         SELECT 1 FROM cera.message_approval a
          WHERE a.message_id = NEW.message_id AND a.decision = 'APPROVED'
            AND (a.expires_at IS NULL OR a.expires_at > NEW.decided_at)
            AND NOT EXISTS (SELECT 1 FROM cera.message_approval i WHERE i.invalidates_approval_id = a.approval_id)) THEN
      RAISE EXCEPTION 'cera: message % already has a live approval', NEW.message_id USING ERRCODE = 'CE005';
    END IF;
    -- ③
    IF NEW.approved_plan_run_id IS NOT NULL THEN
      PERFORM cera.fn_cera_lock_plan_run(NEW.approved_plan_run_id);
      IF EXISTS (SELECT 1 FROM cera.recovery_run r WHERE r.previous_run_id = NEW.approved_plan_run_id) THEN
        RAISE EXCEPTION 'cera: recovery run % has been superseded by a newer run', NEW.approved_plan_run_id USING ERRCODE = 'CE005';
      END IF;
    END IF;
  ELSIF NEW.decision IN ('REJECTED', 'REVISION_REQUESTED') THEN
    -- ④
    IF msg.current_status IS DISTINCT FROM 'PENDING_APPROVAL' THEN
      RAISE EXCEPTION 'cera: only a message awaiting approval can be rejected (message % is %)', NEW.message_id, msg.current_status
        USING ERRCODE = 'CE005';
    END IF;
  ELSE
    -- ⑤ REVOKED · INVALIDATED
    IF EXISTS (SELECT 1 FROM cera.send_attempt s
                WHERE s.message_id = NEW.message_id AND (s.result IS NULL OR s.result IN ('SUCCESS', 'UNKNOWN'))) THEN
      RAISE EXCEPTION 'cera: message % has been sent or is being sent — its approval can no longer be withdrawn', NEW.message_id
        USING ERRCODE = 'CE005';
    END IF;
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint
-- 이름 순서상 M08 tg_message_approval__guard_insert 보다 먼저 돈다(같은 BEFORE INSERT — 잠금을 먼저 잡는다).
CREATE TRIGGER tg_message_approval__guard_decision BEFORE INSERT ON cera.message_approval
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_approval_decision();
