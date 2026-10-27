-- M29 회신 추출 재시도 요청 가드 · 권한 (T-124 · docs/24 18.22)
-- 사람이 쓴 custom migration. M01~M28 은 고치지 않는다.
-- extraction_retry_request 는 append-only — "누가 언제 이 회신을 다시 읽게 했다"는 기록은 바뀌거나 지워지지 않는다.
-- 그 시도의 결과는 이 행이 아니라 기존 기록(실패 = system_error, 완료 = audit_log · extraction)이다.

CREATE TRIGGER tg_extraction_retry_request__append_only BEFORE UPDATE OR DELETE ON cera.extraction_retry_request
  FOR EACH ROW EXECUTE FUNCTION cera.fn_cera_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER tg_extraction_retry_request__no_truncate BEFORE TRUNCATE ON cera.extraction_retry_request FOR EACH STATEMENT EXECUTE FUNCTION cera.fn_cera_reject_truncate();
--> statement-breakpoint

GRANT SELECT, INSERT ON cera.extraction_retry_request TO cera_app;
