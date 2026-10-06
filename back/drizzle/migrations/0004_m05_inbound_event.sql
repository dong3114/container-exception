CREATE TABLE "cera"."event" (
	"event_id" uuid NOT NULL,
	"schema_version" varchar(20) NOT NULL,
	"raw_input_id" uuid NOT NULL,
	"event_class" text NOT NULL,
	"event_type" text NOT NULL,
	"fact_kind" text,
	"fact_key" varchar(120),
	"value_text" text,
	"value_number" numeric(18, 4),
	"value_timestamp" timestamp(3) with time zone,
	"value_code" text,
	"value_unit" text,
	"valid_from" timestamp(3) with time zone,
	"valid_until" timestamp(3) with time zone,
	"applicability_scope_type" text DEFAULT 'GLOBAL' NOT NULL,
	"applicability_scope_ref" varchar(60) DEFAULT '' NOT NULL,
	"source_event_time" timestamp(3) with time zone,
	"source_recorded_at" timestamp(3) with time zone,
	"received_at" timestamp(3) with time zone NOT NULL,
	"source_type" text NOT NULL,
	"source_role_at_ingestion" text,
	"source_id" varchar(60),
	"extraction_method" text NOT NULL,
	"input_quality" text NOT NULL,
	"input_confidence_level" text NOT NULL,
	"input_confidence_reasons" jsonb,
	"asserted_by_counterparty_id" uuid,
	"entered_by_actor_id" uuid,
	"supersedes_event_id" uuid,
	"supersede_reason" varchar(200),
	"verification_action" text,
	"verification_method" text,
	"extraction_id" uuid,
	"correlation_id" varchar(60),
	"idempotency_key" varchar(71) NOT NULL,
	"payload" jsonb,
	"recorded_at" timestamp(3) with time zone NOT NULL,
	"is_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	CONSTRAINT "pk_event" PRIMARY KEY("event_id"),
	CONSTRAINT "uq_event__idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "ck_event__schema_version" CHECK ("cera"."event"."schema_version" ~ '^ev-[1-9][0-9]*$'),
	CONSTRAINT "ck_event__event_class" CHECK ("cera"."event"."event_class" IN ('OBSERVATION', 'CORRECTION', 'VERIFICATION')),
	CONSTRAINT "ck_event__event_type" CHECK ("cera"."event"."event_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_event__fact_kind" CHECK ("cera"."event"."fact_kind" IN ('MILESTONE', 'STATE', 'OFFER', 'TERM', 'IDENTITY', 'PLAN', 'FORECAST')),
	CONSTRAINT "ck_event__value_code" CHECK ("cera"."event"."value_code" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_event__value_unit" CHECK ("cera"."event"."value_unit" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_event__applicability_scope_type" CHECK ("cera"."event"."applicability_scope_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_event__source_type" CHECK ("cera"."event"."source_type" IN ('HUMAN_UI', 'FILE_IMPORT', 'EMAIL', 'DOCUMENT', 'PUBLIC_API', 'PARTNER_SYSTEM', 'INFERENCE')),
	CONSTRAINT "ck_event__source_role_at_ingestion" CHECK ("cera"."event"."source_role_at_ingestion" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_event__extraction_method" CHECK ("cera"."event"."extraction_method" IN ('DIRECT', 'RULE_PARSED', 'LLM_EXTRACTED', 'CALCULATED')),
	CONSTRAINT "ck_event__input_quality" CHECK ("cera"."event"."input_quality" IN ('STRUCTURED', 'SEMI_STRUCTURED', 'UNSTRUCTURED')),
	CONSTRAINT "ck_event__input_confidence_level" CHECK ("cera"."event"."input_confidence_level" IN ('HIGH', 'MEDIUM', 'LOW')),
	CONSTRAINT "ck_event__verification_action" CHECK ("cera"."event"."verification_action" IN ('CONFIRM', 'REJECT', 'REVOKE')),
	CONSTRAINT "ck_event__verification_method" CHECK ("cera"."event"."verification_method" IN ('DIRECT_REVIEW', 'REQUEST_RESOLUTION')),
	CONSTRAINT "ck_event__idempotency_key" CHECK ("cera"."event"."idempotency_key" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_event__s2_simulated_scenario" CHECK ("cera"."event"."is_simulated" = ("cera"."event"."scenario_id" IS NOT NULL)),
	CONSTRAINT "ck_event__class_observation" CHECK ("cera"."event"."event_class" <> 'OBSERVATION' OR ("cera"."event"."fact_kind" IS NOT NULL AND "cera"."event"."fact_key" IS NOT NULL AND num_nonnulls("cera"."event"."value_text", "cera"."event"."value_number", "cera"."event"."value_timestamp", "cera"."event"."value_code") >= 1 AND "cera"."event"."supersedes_event_id" IS NULL AND "cera"."event"."verification_action" IS NULL AND "cera"."event"."verification_method" IS NULL)),
	CONSTRAINT "ck_event__class_correction" CHECK ("cera"."event"."event_class" <> 'CORRECTION' OR ("cera"."event"."fact_kind" IS NOT NULL AND "cera"."event"."fact_key" IS NOT NULL AND "cera"."event"."supersedes_event_id" IS NOT NULL AND "cera"."event"."verification_action" IS NULL AND "cera"."event"."verification_method" IS NULL)),
	CONSTRAINT "ck_event__class_verification" CHECK ("cera"."event"."event_class" <> 'VERIFICATION' OR ("cera"."event"."fact_kind" IS NULL AND "cera"."event"."fact_key" IS NULL AND num_nonnulls("cera"."event"."value_text", "cera"."event"."value_number", "cera"."event"."value_timestamp", "cera"."event"."value_code") = 0 AND "cera"."event"."supersedes_event_id" IS NULL AND "cera"."event"."verification_action" IS NOT NULL AND "cera"."event"."verification_method" IS NOT NULL)),
	CONSTRAINT "ck_event__llm_extraction_pair" CHECK (("cera"."event"."extraction_method" = 'LLM_EXTRACTED') = ("cera"."event"."extraction_id" IS NOT NULL)),
	CONSTRAINT "ck_event__supersedes_not_self" CHECK ("cera"."event"."supersedes_event_id" <> "cera"."event"."event_id"),
	CONSTRAINT "ck_event__scope_global_empty" CHECK (("cera"."event"."applicability_scope_type" = 'GLOBAL') = ("cera"."event"."applicability_scope_ref" = '')),
	CONSTRAINT "ck_event__valid_range" CHECK ("cera"."event"."valid_from" IS NULL OR "cera"."event"."valid_until" IS NULL OR "cera"."event"."valid_from" < "cera"."event"."valid_until"),
	CONSTRAINT "ck_event__krw_integer" CHECK ("cera"."event"."value_unit" <> 'KRW' OR "cera"."event"."value_number" = trunc("cera"."event"."value_number")),
	CONSTRAINT "ck_event__payload_object" CHECK (jsonb_typeof("cera"."event"."payload") = 'object'),
	CONSTRAINT "ck_event__input_confidence_reasons_array" CHECK (jsonb_typeof("cera"."event"."input_confidence_reasons") = 'array')
);
--> statement-breakpoint
CREATE TABLE "cera"."event_entity_link" (
	"event_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"link_role" text NOT NULL,
	CONSTRAINT "pk_event_entity_link" PRIMARY KEY("event_id","entity_type","entity_id"),
	CONSTRAINT "ck_event_entity_link__entity_type" CHECK ("cera"."event_entity_link"."entity_type" IN ('CONTAINER', 'BL', 'FACILITY', 'COUNTERPARTY', 'TRUCK_POOL', 'VESSEL_CALL')),
	CONSTRAINT "ck_event_entity_link__link_role" CHECK ("cera"."event_entity_link"."link_role" IN ('SUBJECT', 'CONTEXT'))
);
--> statement-breakpoint
CREATE TABLE "cera"."event_verification_target" (
	"verification_event_id" uuid NOT NULL,
	"target_event_id" uuid NOT NULL,
	"target_role" text NOT NULL,
	CONSTRAINT "pk_event_verification_target" PRIMARY KEY("verification_event_id","target_event_id","target_role"),
	CONSTRAINT "uq_event_verification_target__verification__target" UNIQUE("verification_event_id","target_event_id"),
	CONSTRAINT "ck_event_verification_target__target_role" CHECK ("cera"."event_verification_target"."target_role" IN ('TARGET', 'OVERRULED'))
);
--> statement-breakpoint
CREATE TABLE "cera"."extraction" (
	"extraction_id" uuid NOT NULL,
	"message_id" uuid,
	"raw_input_id" uuid NOT NULL,
	"ask_id" varchar(40),
	"candidate_value_text" text NOT NULL,
	"candidate_unit" text,
	"source_quote_ref" varchar(300) NOT NULL,
	"source_quote_hash" varchar(71) NOT NULL,
	"quote_location" varchar(100),
	"model_version" varchar(60) NOT NULL,
	"prompt_version" varchar(20) NOT NULL,
	"model_confidence" numeric(5, 4),
	"review_status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_actor_id" uuid,
	"reviewed_at" timestamp(3) with time zone,
	"created_event_id" uuid,
	"is_simulated" boolean NOT NULL,
	"schema_version" varchar(20) NOT NULL,
	"input_hash" varchar(71) NOT NULL,
	"validator_result" jsonb NOT NULL,
	CONSTRAINT "pk_extraction" PRIMARY KEY("extraction_id"),
	CONSTRAINT "ck_extraction__candidate_unit" CHECK ("cera"."extraction"."candidate_unit" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_extraction__source_quote_ref" CHECK ("cera"."extraction"."source_quote_ref" ~ '^cref:v1:EXTRACTION_SOURCE_QUOTE:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "ck_extraction__source_quote_hash" CHECK ("cera"."extraction"."source_quote_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_extraction__review_status" CHECK ("cera"."extraction"."review_status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
	CONSTRAINT "ck_extraction__input_hash" CHECK ("cera"."extraction"."input_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_extraction__accepted_has_event" CHECK (("cera"."extraction"."review_status" = 'ACCEPTED') = ("cera"."extraction"."created_event_id" IS NOT NULL)),
	CONSTRAINT "ck_extraction__reviewed_at" CHECK ("cera"."extraction"."review_status" NOT IN ('ACCEPTED', 'REJECTED') OR "cera"."extraction"."reviewed_at" IS NOT NULL),
	CONSTRAINT "ck_extraction__pending_unreviewed" CHECK ("cera"."extraction"."review_status" <> 'PENDING' OR ("cera"."extraction"."reviewed_by_actor_id" IS NULL AND "cera"."extraction"."reviewed_at" IS NULL AND "cera"."extraction"."created_event_id" IS NULL)),
	CONSTRAINT "ck_extraction__model_confidence" CHECK ("cera"."extraction"."model_confidence" BETWEEN 0 AND 1),
	CONSTRAINT "ck_extraction__validator_result_array" CHECK (jsonb_typeof("cera"."extraction"."validator_result") = 'array')
);
--> statement-breakpoint
CREATE TABLE "cera"."raw_input" (
	"raw_input_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_name" varchar(60) NOT NULL,
	"request_ref" varchar(300),
	"payload_ref" varchar(300),
	"payload_hash" varchar(71) NOT NULL,
	"attachment_manifest" jsonb,
	"source_record_key" varchar(200),
	"source_recorded_at" timestamp(3) with time zone,
	"received_at" timestamp(3) with time zone NOT NULL,
	"collected_by_actor_id" uuid,
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_raw_input" PRIMARY KEY("raw_input_id"),
	CONSTRAINT "uq_raw_input__source_name__source_record_key" UNIQUE("source_name","source_record_key"),
	CONSTRAINT "uq_raw_input__raw_input_id__is_simulated" UNIQUE("raw_input_id","is_simulated"),
	CONSTRAINT "ck_raw_input__source_type" CHECK ("cera"."raw_input"."source_type" IN ('HUMAN_UI', 'FILE_IMPORT', 'EMAIL', 'DOCUMENT', 'PUBLIC_API', 'PARTNER_SYSTEM', 'INFERENCE')),
	CONSTRAINT "ck_raw_input__payload_ref" CHECK ("cera"."raw_input"."payload_ref" ~ '^cref:v1:RAW_INPUT_PAYLOAD:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "ck_raw_input__payload_hash" CHECK ("cera"."raw_input"."payload_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_raw_input__email_recorded_before_received" CHECK ("cera"."raw_input"."source_type" <> 'EMAIL' OR "cera"."raw_input"."source_recorded_at" IS NULL OR "cera"."raw_input"."source_recorded_at" <= "cera"."raw_input"."received_at"),
	CONSTRAINT "ck_raw_input__attachment_manifest_array" CHECK (jsonb_typeof("cera"."raw_input"."attachment_manifest") = 'array')
);
--> statement-breakpoint
ALTER TABLE "cera"."event" ADD CONSTRAINT "fk_event__raw_input_id__is_simulated" FOREIGN KEY ("raw_input_id","is_simulated") REFERENCES "cera"."raw_input"("raw_input_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event" ADD CONSTRAINT "fk_event__asserted_by_counterparty_id" FOREIGN KEY ("asserted_by_counterparty_id") REFERENCES "cera"."counterparty"("counterparty_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event" ADD CONSTRAINT "fk_event__entered_by_actor_id" FOREIGN KEY ("entered_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event" ADD CONSTRAINT "fk_event__supersedes_event_id" FOREIGN KEY ("supersedes_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event" ADD CONSTRAINT "fk_event__extraction_id" FOREIGN KEY ("extraction_id") REFERENCES "cera"."extraction"("extraction_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event" ADD CONSTRAINT "fk_event__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event_entity_link" ADD CONSTRAINT "fk_event_entity_link__event_id" FOREIGN KEY ("event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event_verification_target" ADD CONSTRAINT "fk_event_verification_target__verification_event_id" FOREIGN KEY ("verification_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."event_verification_target" ADD CONSTRAINT "fk_event_verification_target__target_event_id" FOREIGN KEY ("target_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."extraction" ADD CONSTRAINT "fk_extraction__message_id" FOREIGN KEY ("message_id") REFERENCES "cera"."comm_message"("message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."extraction" ADD CONSTRAINT "fk_extraction__raw_input_id__is_simulated" FOREIGN KEY ("raw_input_id","is_simulated") REFERENCES "cera"."raw_input"("raw_input_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."extraction" ADD CONSTRAINT "fk_extraction__reviewed_by_actor_id" FOREIGN KEY ("reviewed_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."extraction" ADD CONSTRAINT "fk_extraction__created_event_id" FOREIGN KEY ("created_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."raw_input" ADD CONSTRAINT "fk_raw_input__collected_by_actor_id" FOREIGN KEY ("collected_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_event__raw_input_id" ON "cera"."event" USING btree ("raw_input_id");--> statement-breakpoint
CREATE INDEX "ix_event__fact_key__scope" ON "cera"."event" USING btree ("fact_key","applicability_scope_type","applicability_scope_ref");--> statement-breakpoint
CREATE INDEX "ix_event__supersedes_event_id" ON "cera"."event" USING btree ("supersedes_event_id") WHERE "cera"."event"."supersedes_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_event__extraction_id" ON "cera"."event" USING btree ("extraction_id") WHERE "cera"."event"."extraction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_event__correlation_id" ON "cera"."event" USING btree ("correlation_id") WHERE "cera"."event"."correlation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_event__received_at" ON "cera"."event" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_event_entity_link__event_id__subject" ON "cera"."event_entity_link" USING btree ("event_id") WHERE "cera"."event_entity_link"."link_role" = 'SUBJECT';--> statement-breakpoint
CREATE INDEX "ix_event_entity_link__subject_entity" ON "cera"."event_entity_link" USING btree ("entity_type","entity_id","event_id") WHERE "cera"."event_entity_link"."link_role" = 'SUBJECT';--> statement-breakpoint
CREATE INDEX "ix_event_verification_target__target_event_id" ON "cera"."event_verification_target" USING btree ("target_event_id");--> statement-breakpoint
CREATE INDEX "ix_extraction__raw_input_id" ON "cera"."extraction" USING btree ("raw_input_id");--> statement-breakpoint
CREATE INDEX "ix_extraction__message_id" ON "cera"."extraction" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ix_extraction__pending" ON "cera"."extraction" USING btree ("review_status") WHERE "cera"."extraction"."review_status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "ix_raw_input__received_at" ON "cera"."raw_input" USING btree ("received_at");