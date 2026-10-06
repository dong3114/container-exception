-- M11 등록부 불변 열 가드 (T-087 U2 · docs/24 12.1 예외 · 22절 변경 방식)
-- 사람이 쓴 custom migration. 기존 공통 함수 fn_cera_guard_columns(M07)를 재사용한다 — 새 함수 없음.
--
-- 왜: 승인 · 발송 가드는 수신자를 address_id 로 맞춘다. 앱 역할이 normalized_address 를 바꾸면 승인된 메시지가
-- 다른 메일 주소로 나갈 수 있고, contact_id · counterparty_id 를 바꾸면 다른 거래처의 연락처로 옮겨 Contact Gate 를
-- 통과시킬 수 있다. 22절은 이 열들을 이미 "불변(주소 변경 = 새 행)"으로 정했다 — 여기서 B층으로 강제한다.
-- 상태 열(3상태 · 확인 · 관계 승인)과 이름 열은 그대로 바뀐다.

CREATE TRIGGER tg_contact_channel_address__guard_columns BEFORE UPDATE ON cera.contact_channel_address
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns(
    'email_verification_status', 'relationship_status', 'communication_status', 'verified_at', 'approved_by_actor_id', 'approved_at');
--> statement-breakpoint
CREATE TRIGGER tg_counterparty_contact__guard_columns BEFORE UPDATE ON cera.counterparty_contact
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('person_name', 'team', 'note', 'is_active');
