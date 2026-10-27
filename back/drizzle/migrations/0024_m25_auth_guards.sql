-- M25 사람 로그인 가드 · 권한 (T-119 · docs/24 22.48)
-- 사람이 쓴 custom migration. M01~M24 는 고치지 않는다. 함수는 now() 를 부르지 않는다.
--
-- user_account: 계정은 HUMAN actor 에만 붙는다(AI_AGENT · SYSTEM 은 로그인 계정을 가질 수 없다 — SQL 로도).
--   바뀔 수 있는 열 = 역할 · 비밀번호 해시 · 활성 · 갱신 시각. 계정 id · actor · 로그인 id · 생성 시각은 불변. 삭제 없음(비활성으로 끈다)
-- user_session: 끊기(revoked_at NULL → 값) 한 번만. 토큰 지문 · 사용자 · 시각은 불변. 삭제 없음

CREATE FUNCTION cera.fn_cera_guard_user_account() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_type text;
BEGIN
  SELECT a.actor_type INTO owner_type FROM cera.actor a WHERE a.actor_id = NEW.actor_id;
  IF owner_type IS DISTINCT FROM 'HUMAN' THEN
    RAISE EXCEPTION 'cera: a login account belongs to a HUMAN actor only (got %)', owner_type USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_user_account__guard BEFORE INSERT ON cera.user_account
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_user_account();
--> statement-breakpoint
CREATE TRIGGER tg_user_account__guard_columns BEFORE UPDATE ON cera.user_account
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('role', 'password_hash', 'is_active', 'updated_at');
--> statement-breakpoint
CREATE TRIGGER tg_user_account__no_delete BEFORE DELETE ON cera.user_account
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_user_account__no_truncate BEFORE TRUNCATE ON cera.user_account FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

CREATE FUNCTION cera.fn_cera_guard_user_session() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'cera: session % is already revoked', OLD.session_id USING ERRCODE = 'CE003';
  END IF;
  IF NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'cera: a session update may only revoke it' USING ERRCODE = 'CE003';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_user_session__guard BEFORE UPDATE ON cera.user_session
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_user_session();
--> statement-breakpoint
CREATE TRIGGER tg_user_session__guard_columns BEFORE UPDATE ON cera.user_session
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_columns('revoked_at');
--> statement-breakpoint
CREATE TRIGGER tg_user_session__no_delete BEFORE DELETE ON cera.user_session
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_delete();
--> statement-breakpoint
CREATE TRIGGER tg_user_session__no_truncate BEFORE TRUNCATE ON cera.user_session FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON cera.user_account TO cera_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON cera.user_session TO cera_app;
