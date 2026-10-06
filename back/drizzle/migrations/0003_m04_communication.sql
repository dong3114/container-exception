CREATE TABLE "cera"."comm_message" (
	"message_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"message_kind" text NOT NULL,
	"contact_verification_id" uuid,
	"channel_type" text NOT NULL,
	"external_message_id" varchar(200),
	"from_address" varchar(200),
	"to_address_id" uuid,
	"message_content_ref" varchar(300),
	"content_hash" varchar(71) NOT NULL,
	"current_status" text,
	"current_approval_id" uuid,
	"drafted_by" text,
	"created_at" timestamp(3) with time zone NOT NULL,
	"sent_at" timestamp(3) with time zone,
	"received_at" timestamp(3) with time zone,
	"is_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	CONSTRAINT "pk_comm_message" PRIMARY KEY("message_id"),
	CONSTRAINT "uq_comm_message__channel_type__external_message_id" UNIQUE("channel_type","external_message_id"),
	CONSTRAINT "uq_comm_message__message_id__is_simulated" UNIQUE("message_id","is_simulated"),
	CONSTRAINT "uq_comm_message__message_id__to_address_id" UNIQUE("message_id","to_address_id"),
	CONSTRAINT "ck_comm_message__direction" CHECK ("cera"."comm_message"."direction" IN ('OUTBOUND', 'INBOUND')),
	CONSTRAINT "ck_comm_message__message_kind" CHECK ("cera"."comm_message"."message_kind" IN ('BUSINESS', 'CONTACT_VERIFICATION')),
	CONSTRAINT "ck_comm_message__channel_type" CHECK ("cera"."comm_message"."channel_type" IN ('GMAIL', 'MOCK', 'PORTAL')),
	CONSTRAINT "ck_comm_message__message_content_ref" CHECK ("cera"."comm_message"."message_content_ref" ~ '^cref:v1:COMM_MESSAGE_CONTENT:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "ck_comm_message__content_hash" CHECK ("cera"."comm_message"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_comm_message__current_status" CHECK ("cera"."comm_message"."current_status" IN ('DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'QUEUED', 'SENT', 'DELIVERY_FAILED', 'REPLIED', 'CLOSED')),
	CONSTRAINT "ck_comm_message__drafted_by" CHECK ("cera"."comm_message"."drafted_by" IN ('AI_DRAFT', 'HUMAN', 'TEMPLATE')),
	CONSTRAINT "ck_comm_message__s2_simulated_scenario" CHECK ("cera"."comm_message"."is_simulated" = ("cera"."comm_message"."scenario_id" IS NOT NULL)),
	CONSTRAINT "ck_comm_message__cv_requires_verification" CHECK ("cera"."comm_message"."message_kind" <> 'CONTACT_VERIFICATION' OR "cera"."comm_message"."contact_verification_id" IS NOT NULL),
	CONSTRAINT "ck_comm_message__p0_no_contact_verification" CHECK ("cera"."comm_message"."contact_verification_id" IS NULL),
	CONSTRAINT "ck_comm_message__outbound_recipient_content" CHECK ("cera"."comm_message"."direction" <> 'OUTBOUND' OR ("cera"."comm_message"."to_address_id" IS NOT NULL AND "cera"."comm_message"."message_content_ref" IS NOT NULL)),
	CONSTRAINT "ck_comm_message__inbound_received_at" CHECK ("cera"."comm_message"."direction" <> 'INBOUND' OR "cera"."comm_message"."received_at" IS NOT NULL),
	CONSTRAINT "ck_comm_message__outbound_drafted_by" CHECK (("cera"."comm_message"."direction" = 'OUTBOUND') = ("cera"."comm_message"."drafted_by" IS NOT NULL)),
	CONSTRAINT "ck_comm_message__outbound_current_status" CHECK (("cera"."comm_message"."direction" = 'OUTBOUND') = ("cera"."comm_message"."current_status" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cera"."comm_message_question" (
	"message_id" uuid NOT NULL,
	"question_item_id" uuid NOT NULL,
	CONSTRAINT "pk_comm_message_question" PRIMARY KEY("message_id","question_item_id")
);
--> statement-breakpoint
CREATE TABLE "cera"."comm_message_structured_field" (
	"message_id" uuid NOT NULL,
	"field_key" varchar(60) NOT NULL,
	"value_text" text,
	"value_number" numeric(18, 4),
	"unit" text,
	"source_run_id" uuid,
	"source_question_item_id" uuid,
	"source_path" varchar(120),
	CONSTRAINT "pk_comm_message_structured_field" PRIMARY KEY("message_id","field_key"),
	CONSTRAINT "ck_comm_message_structured_field__field_key" CHECK ("cera"."comm_message_structured_field"."field_key" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "ck_comm_message_structured_field__unit" CHECK ("cera"."comm_message_structured_field"."unit" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_comm_message_structured_field__value_present" CHECK (num_nonnulls("cera"."comm_message_structured_field"."value_text", "cera"."comm_message_structured_field"."value_number") >= 1),
	CONSTRAINT "ck_comm_message_structured_field__krw_integer" CHECK ("cera"."comm_message_structured_field"."unit" <> 'KRW' OR "cera"."comm_message_structured_field"."value_number" = trunc("cera"."comm_message_structured_field"."value_number"))
);
--> statement-breakpoint
CREATE TABLE "cera"."comm_thread" (
	"thread_id" uuid NOT NULL,
	"channel_type" text NOT NULL,
	"external_thread_id" varchar(200),
	"counterparty_id" uuid NOT NULL,
	"contact_id" uuid,
	"purpose" text NOT NULL,
	"related_run_id" uuid,
	"thread_status" text NOT NULL,
	"opened_at" timestamp(3) with time zone NOT NULL,
	"last_activity_at" timestamp(3) with time zone NOT NULL,
	"is_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	CONSTRAINT "pk_comm_thread" PRIMARY KEY("thread_id"),
	CONSTRAINT "uq_comm_thread__channel_type__external_thread_id" UNIQUE("channel_type","external_thread_id"),
	CONSTRAINT "uq_comm_thread__thread_id__channel_type__is_simulated" UNIQUE("thread_id","channel_type","is_simulated"),
	CONSTRAINT "ck_comm_thread__channel_type" CHECK ("cera"."comm_thread"."channel_type" IN ('GMAIL', 'MOCK', 'PORTAL')),
	CONSTRAINT "ck_comm_thread__purpose" CHECK ("cera"."comm_thread"."purpose" IN ('CAPACITY_CHECK', 'RATE_REQUEST', 'SLOT_REQUEST', 'FACT_CONFIRM', 'GENERAL')),
	CONSTRAINT "ck_comm_thread__thread_status" CHECK ("cera"."comm_thread"."thread_status" IN ('OPEN', 'WAITING_REPLY', 'ANSWERED', 'CLOSED')),
	CONSTRAINT "ck_comm_thread__s2_simulated_scenario" CHECK ("cera"."comm_thread"."is_simulated" = ("cera"."comm_thread"."scenario_id" IS NOT NULL)),
	CONSTRAINT "ck_comm_thread__simulated_mock_only" CHECK (NOT "cera"."comm_thread"."is_simulated" OR "cera"."comm_thread"."channel_type" = 'MOCK'),
	CONSTRAINT "ck_comm_thread__last_activity_after_open" CHECK ("cera"."comm_thread"."last_activity_at" >= "cera"."comm_thread"."opened_at")
);
--> statement-breakpoint
CREATE TABLE "cera"."message_approval" (
	"approval_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"invalidates_approval_id" uuid,
	"invalidation_cause" text,
	"actor_id" uuid NOT NULL,
	"decided_at" timestamp(3) with time zone NOT NULL,
	"expires_at" timestamp(3) with time zone,
	"approved_content_ref" varchar(300),
	"approved_plan_run_id" uuid,
	"approved_content_hash" varchar(71),
	"approved_to_address_id" uuid,
	"reason" varchar(500),
	CONSTRAINT "pk_message_approval" PRIMARY KEY("approval_id"),
	CONSTRAINT "uq_message_approval__invalidates_approval_id" UNIQUE("invalidates_approval_id"),
	CONSTRAINT "uq_message_approval__approval_id__message_id" UNIQUE("approval_id","message_id"),
	CONSTRAINT "ck_message_approval__decision" CHECK ("cera"."message_approval"."decision" IN ('APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'REVOKED', 'INVALIDATED')),
	CONSTRAINT "ck_message_approval__invalidation_cause" CHECK ("cera"."message_approval"."invalidation_cause" IN ('USER_REVOKED', 'PLAN_SUPERSEDED', 'CONTENT_CHANGED')),
	CONSTRAINT "ck_message_approval__approved_content_ref" CHECK ("cera"."message_approval"."approved_content_ref" ~ '^cref:v1:MESSAGE_APPROVAL_CONTENT:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "ck_message_approval__approved_content_hash" CHECK ("cera"."message_approval"."approved_content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_message_approval__invalidates_pair" CHECK (("cera"."message_approval"."decision" IN ('REVOKED', 'INVALIDATED')) = ("cera"."message_approval"."invalidates_approval_id" IS NOT NULL)),
	CONSTRAINT "ck_message_approval__cause_pair" CHECK (("cera"."message_approval"."decision" IN ('REVOKED', 'INVALIDATED')) = ("cera"."message_approval"."invalidation_cause" IS NOT NULL)),
	CONSTRAINT "ck_message_approval__cause_by_decision" CHECK (("cera"."message_approval"."decision" <> 'REVOKED' OR "cera"."message_approval"."invalidation_cause" = 'USER_REVOKED') AND ("cera"."message_approval"."decision" <> 'INVALIDATED' OR "cera"."message_approval"."invalidation_cause" IN ('PLAN_SUPERSEDED', 'CONTENT_CHANGED'))),
	CONSTRAINT "ck_message_approval__approved_copy" CHECK ("cera"."message_approval"."decision" <> 'APPROVED' OR ("cera"."message_approval"."approved_content_hash" IS NOT NULL AND "cera"."message_approval"."approved_to_address_id" IS NOT NULL)),
	CONSTRAINT "ck_message_approval__reason_required" CHECK ("cera"."message_approval"."decision" NOT IN ('REJECTED', 'REVISION_REQUESTED') OR "cera"."message_approval"."reason" IS NOT NULL),
	CONSTRAINT "ck_message_approval__expires_after_decided" CHECK ("cera"."message_approval"."expires_at" IS NULL OR "cera"."message_approval"."expires_at" > "cera"."message_approval"."decided_at")
);
--> statement-breakpoint
CREATE TABLE "cera"."message_approval_structured_field" (
	"approval_id" uuid NOT NULL,
	"field_key" varchar(60) NOT NULL,
	"approved_value_text" text,
	"approved_value_number" numeric(18, 4),
	"approved_unit" text,
	"approved_source_run_id" uuid,
	"approved_source_question_item_id" uuid,
	"approved_source_path" varchar(120),
	CONSTRAINT "pk_message_approval_structured_field" PRIMARY KEY("approval_id","field_key"),
	CONSTRAINT "ck_message_approval_structured_field__approved_unit" CHECK ("cera"."message_approval_structured_field"."approved_unit" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_message_approval_structured_field__value_present" CHECK (num_nonnulls("cera"."message_approval_structured_field"."approved_value_text", "cera"."message_approval_structured_field"."approved_value_number") >= 1),
	CONSTRAINT "ck_message_approval_structured_field__krw_integer" CHECK ("cera"."message_approval_structured_field"."approved_unit" <> 'KRW' OR "cera"."message_approval_structured_field"."approved_value_number" = trunc("cera"."message_approval_structured_field"."approved_value_number"))
);
--> statement-breakpoint
CREATE TABLE "cera"."message_status_transition" (
	"transition_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"status" text NOT NULL,
	"occurred_at" timestamp(3) with time zone NOT NULL,
	"actor_id" uuid,
	"send_attempt_id" uuid,
	"note" varchar(300),
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_message_status_transition" PRIMARY KEY("transition_id"),
	CONSTRAINT "ck_message_status_transition__status" CHECK ("cera"."message_status_transition"."status" IN ('DRAFTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'QUEUED', 'SENT', 'DELIVERY_FAILED', 'REPLIED', 'CLOSED'))
);
--> statement-breakpoint
CREATE TABLE "cera"."question_item" (
	"question_item_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"ask_id" varchar(40) NOT NULL,
	"question_type" text NOT NULL,
	"question_text" text NOT NULL,
	"target_entity_type" text,
	"target_entity_id" uuid,
	"target_fact_key" varchar(120),
	"target_applicability_scope_type" text,
	"target_applicability_scope_ref" varchar(60),
	"expected_value_type" text NOT NULL,
	"expected_unit" text,
	"verification_request_key" varchar(71),
	"question_status" text NOT NULL,
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_question_item" PRIMARY KEY("question_item_id"),
	CONSTRAINT "uq_question_item__thread_id__ask_id" UNIQUE("thread_id","ask_id"),
	CONSTRAINT "ck_question_item__question_type" CHECK ("cera"."question_item"."question_type" IN ('CAPACITY', 'RATE', 'SLOT', 'CONFIRM_FACT', 'FREE_TEXT')),
	CONSTRAINT "ck_question_item__target_entity_type" CHECK ("cera"."question_item"."target_entity_type" IN ('CONTAINER', 'BL', 'FACILITY', 'COUNTERPARTY', 'TRUCK_POOL', 'VESSEL_CALL')),
	CONSTRAINT "ck_question_item__target_applicability_scope_type" CHECK ("cera"."question_item"."target_applicability_scope_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_question_item__expected_value_type" CHECK ("cera"."question_item"."expected_value_type" IN ('NUMBER', 'TIMESTAMP', 'CODE', 'TEXT', 'BOOLEAN')),
	CONSTRAINT "ck_question_item__expected_unit" CHECK ("cera"."question_item"."expected_unit" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_question_item__verification_request_key" CHECK ("cera"."question_item"."verification_request_key" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_question_item__question_status" CHECK ("cera"."question_item"."question_status" IN ('DRAFTED', 'SENT', 'ANSWERED', 'UNANSWERED', 'CANCELLED')),
	CONSTRAINT "ck_question_item__target_all_or_none" CHECK (num_nonnulls("cera"."question_item"."target_entity_type", "cera"."question_item"."target_entity_id", "cera"."question_item"."target_fact_key", "cera"."question_item"."target_applicability_scope_type", "cera"."question_item"."target_applicability_scope_ref") IN (0, 5)),
	CONSTRAINT "ck_question_item__target_scope_global_empty" CHECK ("cera"."question_item"."target_applicability_scope_type" IS NULL OR ("cera"."question_item"."target_applicability_scope_type" = 'GLOBAL') = ("cera"."question_item"."target_applicability_scope_ref" = ''))
);
--> statement-breakpoint
CREATE TABLE "cera"."send_attempt" (
	"send_attempt_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"approval_id" uuid,
	"attempt_no" integer NOT NULL,
	"idempotency_key" varchar(71) NOT NULL,
	"channel_connection_id" uuid,
	"sent_content_hash" varchar(71) NOT NULL,
	"started_at" timestamp(3) with time zone NOT NULL,
	"finished_at" timestamp(3) with time zone,
	"result" text,
	"error_code" text,
	"error_message" varchar(500),
	"provider_message_id" varchar(200),
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_send_attempt" PRIMARY KEY("send_attempt_id"),
	CONSTRAINT "uq_send_attempt__message_id__attempt_no" UNIQUE("message_id","attempt_no"),
	CONSTRAINT "uq_send_attempt__idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "uq_send_attempt__send_attempt_id__message_id" UNIQUE("send_attempt_id","message_id"),
	CONSTRAINT "ck_send_attempt__idempotency_key" CHECK ("cera"."send_attempt"."idempotency_key" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_send_attempt__sent_content_hash" CHECK ("cera"."send_attempt"."sent_content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_send_attempt__result" CHECK ("cera"."send_attempt"."result" IN ('SUCCESS', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN')),
	CONSTRAINT "ck_send_attempt__error_code" CHECK ("cera"."send_attempt"."error_code" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_send_attempt__attempt_no" CHECK ("cera"."send_attempt"."attempt_no" >= 1),
	CONSTRAINT "ck_send_attempt__result_finished_pair" CHECK (("cera"."send_attempt"."result" IS NULL) = ("cera"."send_attempt"."finished_at" IS NULL)),
	CONSTRAINT "ck_send_attempt__success_no_error" CHECK ("cera"."send_attempt"."result" <> 'SUCCESS' OR "cera"."send_attempt"."error_code" IS NULL),
	CONSTRAINT "ck_send_attempt__success_provider_id" CHECK ("cera"."send_attempt"."result" <> 'SUCCESS' OR "cera"."send_attempt"."provider_message_id" IS NOT NULL),
	CONSTRAINT "ck_send_attempt__finished_after_started" CHECK ("cera"."send_attempt"."finished_at" IS NULL OR "cera"."send_attempt"."finished_at" >= "cera"."send_attempt"."started_at"),
	CONSTRAINT "ck_send_attempt__p0_no_channel_connection" CHECK ("cera"."send_attempt"."channel_connection_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "cera"."comm_message" ADD CONSTRAINT "fk_comm_message__thread_id__channel_type__is_simulated" FOREIGN KEY ("thread_id","channel_type","is_simulated") REFERENCES "cera"."comm_thread"("thread_id","channel_type","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message" ADD CONSTRAINT "fk_comm_message__to_address_id__channel_type" FOREIGN KEY ("to_address_id","channel_type") REFERENCES "cera"."contact_channel_address"("address_id","channel_type") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message" ADD CONSTRAINT "fk_comm_message__current_approval_id__message_id" FOREIGN KEY ("current_approval_id","message_id") REFERENCES "cera"."message_approval"("approval_id","message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message" ADD CONSTRAINT "fk_comm_message__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message_question" ADD CONSTRAINT "fk_comm_message_question__message_id" FOREIGN KEY ("message_id") REFERENCES "cera"."comm_message"("message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message_question" ADD CONSTRAINT "fk_comm_message_question__question_item_id" FOREIGN KEY ("question_item_id") REFERENCES "cera"."question_item"("question_item_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message_structured_field" ADD CONSTRAINT "fk_comm_message_structured_field__message_id" FOREIGN KEY ("message_id") REFERENCES "cera"."comm_message"("message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message_structured_field" ADD CONSTRAINT "fk_comm_message_structured_field__source_run_id" FOREIGN KEY ("source_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_message_structured_field" ADD CONSTRAINT "fk_comm_message_structured_field__source_question_item_id" FOREIGN KEY ("source_question_item_id") REFERENCES "cera"."question_item"("question_item_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_thread" ADD CONSTRAINT "fk_comm_thread__counterparty_id" FOREIGN KEY ("counterparty_id") REFERENCES "cera"."counterparty"("counterparty_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_thread" ADD CONSTRAINT "fk_comm_thread__contact_id__counterparty_id" FOREIGN KEY ("contact_id","counterparty_id") REFERENCES "cera"."counterparty_contact"("contact_id","counterparty_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_thread" ADD CONSTRAINT "fk_comm_thread__related_run_id" FOREIGN KEY ("related_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."comm_thread" ADD CONSTRAINT "fk_comm_thread__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval" ADD CONSTRAINT "fk_message_approval__message_id" FOREIGN KEY ("message_id") REFERENCES "cera"."comm_message"("message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval" ADD CONSTRAINT "fk_message_approval__invalidates_approval_id__message_id" FOREIGN KEY ("invalidates_approval_id","message_id") REFERENCES "cera"."message_approval"("approval_id","message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval" ADD CONSTRAINT "fk_message_approval__actor_id" FOREIGN KEY ("actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval" ADD CONSTRAINT "fk_message_approval__approved_plan_run_id" FOREIGN KEY ("approved_plan_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval" ADD CONSTRAINT "fk_message_approval__message_id__approved_to_address_id" FOREIGN KEY ("message_id","approved_to_address_id") REFERENCES "cera"."comm_message"("message_id","to_address_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval_structured_field" ADD CONSTRAINT "fk_message_approval_structured_field__approval_id" FOREIGN KEY ("approval_id") REFERENCES "cera"."message_approval"("approval_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval_structured_field" ADD CONSTRAINT "fk_message_approval_structured_field__approved_source_run_id" FOREIGN KEY ("approved_source_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_approval_structured_field" ADD CONSTRAINT "fk_message_approval_structured_field__approved_src_question" FOREIGN KEY ("approved_source_question_item_id") REFERENCES "cera"."question_item"("question_item_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_status_transition" ADD CONSTRAINT "fk_message_status_transition__message_id__is_simulated" FOREIGN KEY ("message_id","is_simulated") REFERENCES "cera"."comm_message"("message_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_status_transition" ADD CONSTRAINT "fk_message_status_transition__actor_id" FOREIGN KEY ("actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."message_status_transition" ADD CONSTRAINT "fk_message_status_transition__send_attempt_id__message_id" FOREIGN KEY ("send_attempt_id","message_id") REFERENCES "cera"."send_attempt"("send_attempt_id","message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."question_item" ADD CONSTRAINT "fk_question_item__thread_id" FOREIGN KEY ("thread_id") REFERENCES "cera"."comm_thread"("thread_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."send_attempt" ADD CONSTRAINT "fk_send_attempt__message_id__is_simulated" FOREIGN KEY ("message_id","is_simulated") REFERENCES "cera"."comm_message"("message_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."send_attempt" ADD CONSTRAINT "fk_send_attempt__approval_id__message_id" FOREIGN KEY ("approval_id","message_id") REFERENCES "cera"."message_approval"("approval_id","message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_comm_message__queued" ON "cera"."comm_message" USING btree ("created_at") WHERE "cera"."comm_message"."current_status" = 'QUEUED';--> statement-breakpoint
CREATE INDEX "ix_comm_message__thread_id__created_at" ON "cera"."comm_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_comm_message__to_address_id" ON "cera"."comm_message" USING btree ("to_address_id");--> statement-breakpoint
CREATE INDEX "ix_comm_message_question__question_item_id" ON "cera"."comm_message_question" USING btree ("question_item_id");--> statement-breakpoint
CREATE INDEX "ix_comm_message_structured_field__source_run_id" ON "cera"."comm_message_structured_field" USING btree ("source_run_id");--> statement-breakpoint
CREATE INDEX "ix_comm_message_structured_field__source_question_item_id" ON "cera"."comm_message_structured_field" USING btree ("source_question_item_id");--> statement-breakpoint
CREATE INDEX "ix_comm_thread__counterparty_id" ON "cera"."comm_thread" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "ix_comm_thread__related_run_id" ON "cera"."comm_thread" USING btree ("related_run_id");--> statement-breakpoint
CREATE INDEX "ix_message_approval__message_id__decided_at" ON "cera"."message_approval" USING btree ("message_id","decided_at");--> statement-breakpoint
CREATE INDEX "ix_message_approval__approved" ON "cera"."message_approval" USING btree ("message_id") WHERE "cera"."message_approval"."decision" = 'APPROVED';--> statement-breakpoint
CREATE INDEX "ix_message_status_transition__message_id__occurred_at" ON "cera"."message_status_transition" USING btree ("message_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ix_question_item__verification_request_key" ON "cera"."question_item" USING btree ("verification_request_key") WHERE "cera"."question_item"."verification_request_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_send_attempt__message_id__success" ON "cera"."send_attempt" USING btree ("message_id") WHERE "cera"."send_attempt"."result" = 'SUCCESS';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_send_attempt__message_id__unresolved" ON "cera"."send_attempt" USING btree ("message_id") WHERE "cera"."send_attempt"."result" IS NULL OR "cera"."send_attempt"."result" = 'UNKNOWN';--> statement-breakpoint
CREATE INDEX "ix_send_attempt__pending" ON "cera"."send_attempt" USING btree ("started_at") WHERE "cera"."send_attempt"."result" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_send_attempt__provider_message_id" ON "cera"."send_attempt" USING btree ("provider_message_id") WHERE "cera"."send_attempt"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_send_attempt__message_id" ON "cera"."send_attempt" USING btree ("message_id");