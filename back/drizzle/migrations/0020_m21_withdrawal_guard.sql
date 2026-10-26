-- M21 철회 가드 (T-111 · docs/24 22.42)
-- 사람이 쓴 custom migration. M01~M20 은 고치지 않는다. 새 표 · 새 열 없음. 함수는 now() 를 부르지 않는다.
--
-- 철회(withdrawal) = 값이 하나도 없는 CORRECTION. 그 시점까지의 값을 현재 사실에서 뺀다(새 값 없이).
-- 현재는 **사람만** 철회할 수 있다: 출처가 HUMAN_UI 여야 하고(M20 이 HUMAN_UI 사건의 행위자를 HUMAN 으로 막는다),
-- 그래서 AI · Agent · 시스템 행위자는 SQL 로도 확정 사실을 철회하지 못한다. 결정론 시스템 출처의 철회가 필요해지면 계열별 권한과 함께 따로 정의한다.

CREATE FUNCTION cera.fn_cera_guard_event_withdrawal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_class = 'CORRECTION'
     AND num_nonnulls(NEW.value_text, NEW.value_number, NEW.value_timestamp, NEW.value_code) = 0
     AND NEW.source_type <> 'HUMAN_UI' THEN
    RAISE EXCEPTION 'cera: a withdrawal (a CORRECTION without a value) is recorded by a human (HUMAN_UI), got %', NEW.source_type
      USING ERRCODE = 'CE005';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tg_event__guard_withdrawal BEFORE INSERT ON cera.event
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_guard_event_withdrawal();
