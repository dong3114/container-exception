-- M35 연락처 수동 선택 가드 · 권한 (T-129 · docs/24 22.58)
-- 사람이 쓴 custom migration. M01~M34 는 고치지 않는다.
-- contact_selection 은 append-only — "누가 언제 이 한 건의 받는 주소를 골랐다"는 기록은 바뀌거나 지워지지 않는다.
-- 다시 고르면 새 행이다. 선택이 지금도 쓸 수 있는지(Contact Gate)는 이 행이 아니라 등록부의 지금 상태로 매번 판정한다(Backend).

CREATE TRIGGER tg_contact_selection__append_only BEFORE UPDATE OR DELETE ON cera.contact_selection
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_contact_selection__no_truncate BEFORE TRUNCATE ON cera.contact_selection FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT ON cera.contact_selection TO cera_app;
