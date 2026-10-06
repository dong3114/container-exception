CREATE TABLE "cera"."canonical_fact" (
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"fact_key" varchar(120) NOT NULL,
	"applicability_scope_type" text DEFAULT 'GLOBAL' NOT NULL,
	"applicability_scope_ref" varchar(60) DEFAULT '' NOT NULL,
	"fact_name" varchar(60) NOT NULL,
	"param_date" date,
	"param_slot_start" timestamp(3) with time zone,
	"param_size_type" text,
	"value_text" text,
	"value_number" numeric(18, 4),
	"value_timestamp" timestamp(3) with time zone,
	"value_code" text,
	"value_unit" text,
	"valid_from" timestamp(3) with time zone,
	"valid_until" timestamp(3) with time zone,
	"winning_event_id" uuid NOT NULL,
	"applied_rule" text NOT NULL,
	"rule_version" varchar(20) NOT NULL,
	"value_status" text NOT NULL,
	"verification_basis" text,
	"evidence_strength" text NOT NULL,
	"evidence_policy_version" varchar(20) NOT NULL,
	"evidence_time" timestamp(3) with time zone,
	"evidence_time_quality" text NOT NULL,
	"temporal_confidence" text NOT NULL,
	"freshness_status" text NOT NULL,
	"conflict_status" text NOT NULL,
	"hold_status" text NOT NULL,
	"decision_usability" text NOT NULL,
	"contributing_event_count" integer NOT NULL,
	"is_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	"computed_as_of" timestamp(3) with time zone NOT NULL,
	"computed_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_canonical_fact" PRIMARY KEY("entity_type","entity_id","fact_key","applicability_scope_type","applicability_scope_ref","is_simulated"),
	CONSTRAINT "ck_canonical_fact__entity_type" CHECK ("cera"."canonical_fact"."entity_type" IN ('CONTAINER', 'BL', 'FACILITY', 'COUNTERPARTY', 'TRUCK_POOL', 'VESSEL_CALL')),
	CONSTRAINT "ck_canonical_fact__applicability_scope_type" CHECK ("cera"."canonical_fact"."applicability_scope_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_canonical_fact__param_size_type" CHECK ("cera"."canonical_fact"."param_size_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_canonical_fact__value_code" CHECK ("cera"."canonical_fact"."value_code" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_canonical_fact__value_unit" CHECK ("cera"."canonical_fact"."value_unit" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_canonical_fact__applied_rule" CHECK ("cera"."canonical_fact"."applied_rule" ~ '^R[0-9]{1,2}(-[a-z])?$'),
	CONSTRAINT "ck_canonical_fact__value_status" CHECK ("cera"."canonical_fact"."value_status" IN ('CONFIRMED', 'OBSERVED', 'PROVISIONAL', 'INFERRED', 'UNKNOWN')),
	CONSTRAINT "ck_canonical_fact__verification_basis" CHECK ("cera"."canonical_fact"."verification_basis" IN ('HUMAN_VERIFICATION', 'AUTHORITATIVE_SYSTEM', 'POLICY_EVIDENCE')),
	CONSTRAINT "ck_canonical_fact__evidence_strength" CHECK ("cera"."canonical_fact"."evidence_strength" IN ('0', '1', '2', '3')),
	CONSTRAINT "ck_canonical_fact__evidence_time_quality" CHECK ("cera"."canonical_fact"."evidence_time_quality" IN ('EVENT_TIME', 'RECORDED_TIME', 'RECEIVED_ONLY')),
	CONSTRAINT "ck_canonical_fact__temporal_confidence" CHECK ("cera"."canonical_fact"."temporal_confidence" IN ('HIGH', 'MEDIUM', 'LOW')),
	CONSTRAINT "ck_canonical_fact__freshness_status" CHECK ("cera"."canonical_fact"."freshness_status" IN ('FRESH', 'AGING', 'STALE', 'EXPIRED', 'UNKNOWN', 'N_A')),
	CONSTRAINT "ck_canonical_fact__conflict_status" CHECK ("cera"."canonical_fact"."conflict_status" IN ('NONE', 'DISSENT', 'OPEN')),
	CONSTRAINT "ck_canonical_fact__hold_status" CHECK ("cera"."canonical_fact"."hold_status" IN ('NONE', 'HELD')),
	CONSTRAINT "ck_canonical_fact__decision_usability" CHECK ("cera"."canonical_fact"."decision_usability" IN ('USABLE', 'USABLE_WITH_WARNING', 'APPROVAL_BLOCKED', 'UNUSABLE')),
	CONSTRAINT "ck_canonical_fact__s2_simulated_scenario" CHECK ("cera"."canonical_fact"."is_simulated" = ("cera"."canonical_fact"."scenario_id" IS NOT NULL)),
	CONSTRAINT "ck_canonical_fact__scope_global_empty" CHECK (("cera"."canonical_fact"."applicability_scope_type" = 'GLOBAL') = ("cera"."canonical_fact"."applicability_scope_ref" = '')),
	CONSTRAINT "ck_canonical_fact__confirmed_basis" CHECK (("cera"."canonical_fact"."value_status" = 'CONFIRMED') = ("cera"."canonical_fact"."verification_basis" IS NOT NULL)),
	CONSTRAINT "ck_canonical_fact__contributing_event_count" CHECK ("cera"."canonical_fact"."contributing_event_count" >= 1),
	CONSTRAINT "ck_canonical_fact__krw_integer" CHECK ("cera"."canonical_fact"."value_unit" <> 'KRW' OR "cera"."canonical_fact"."value_number" = trunc("cera"."canonical_fact"."value_number")),
	CONSTRAINT "ck_canonical_fact__valid_range" CHECK ("cera"."canonical_fact"."valid_from" IS NULL OR "cera"."canonical_fact"."valid_until" IS NULL OR "cera"."canonical_fact"."valid_from" < "cera"."canonical_fact"."valid_until")
);
--> statement-breakpoint
CREATE TABLE "cera"."conflict" (
	"conflict_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"fact_key" varchar(120) NOT NULL,
	"applicability_scope_type" text NOT NULL,
	"applicability_scope_ref" varchar(60) DEFAULT '' NOT NULL,
	"conflict_type" text NOT NULL,
	"event_ids" uuid[] NOT NULL,
	"severity" text NOT NULL,
	"detected_rule" text NOT NULL,
	"rule_version" varchar(20) NOT NULL,
	"blocks_automation" boolean NOT NULL,
	"computed_as_of" timestamp(3) with time zone NOT NULL,
	"is_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	CONSTRAINT "pk_conflict" PRIMARY KEY("conflict_id"),
	CONSTRAINT "ck_conflict__entity_type" CHECK ("cera"."conflict"."entity_type" IN ('CONTAINER', 'BL', 'FACILITY', 'COUNTERPARTY', 'TRUCK_POOL', 'VESSEL_CALL')),
	CONSTRAINT "ck_conflict__applicability_scope_type" CHECK ("cera"."conflict"."applicability_scope_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_conflict__conflict_type" CHECK ("cera"."conflict"."conflict_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_conflict__severity" CHECK ("cera"."conflict"."severity" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_conflict__detected_rule" CHECK ("cera"."conflict"."detected_rule" ~ '^R[0-9]{1,2}(-[a-z])?$'),
	CONSTRAINT "ck_conflict__s2_simulated_scenario" CHECK ("cera"."conflict"."is_simulated" = ("cera"."conflict"."scenario_id" IS NOT NULL)),
	CONSTRAINT "ck_conflict__scope_global_empty" CHECK (("cera"."conflict"."applicability_scope_type" = 'GLOBAL') = ("cera"."conflict"."applicability_scope_ref" = '')),
	CONSTRAINT "ck_conflict__event_ids_cardinality" CHECK (cardinality("cera"."conflict"."event_ids") >= 2)
);
--> statement-breakpoint
CREATE TABLE "cera"."verification_request" (
	"verification_request_id" uuid NOT NULL,
	"request_key" varchar(71) NOT NULL,
	"trigger_rule" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"fact_key" varchar(120) NOT NULL,
	"applicability_scope_type" text NOT NULL,
	"applicability_scope_ref" varchar(60) DEFAULT '' NOT NULL,
	"conflict_id" uuid,
	"priority" text NOT NULL,
	"blocks_automation" boolean NOT NULL,
	"computed_as_of" timestamp(3) with time zone NOT NULL,
	"computed_at" timestamp(3) with time zone NOT NULL,
	"current_status" text NOT NULL,
	"is_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	CONSTRAINT "pk_verification_request" PRIMARY KEY("verification_request_id"),
	CONSTRAINT "uq_verification_request__request_key" UNIQUE("request_key"),
	CONSTRAINT "ck_verification_request__request_key" CHECK ("cera"."verification_request"."request_key" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_verification_request__trigger_rule" CHECK ("cera"."verification_request"."trigger_rule" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_verification_request__entity_type" CHECK ("cera"."verification_request"."entity_type" IN ('CONTAINER', 'BL', 'FACILITY', 'COUNTERPARTY', 'TRUCK_POOL', 'VESSEL_CALL')),
	CONSTRAINT "ck_verification_request__applicability_scope_type" CHECK ("cera"."verification_request"."applicability_scope_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_verification_request__priority" CHECK ("cera"."verification_request"."priority" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_verification_request__current_status" CHECK ("cera"."verification_request"."current_status" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_verification_request__s2_simulated_scenario" CHECK ("cera"."verification_request"."is_simulated" = ("cera"."verification_request"."scenario_id" IS NOT NULL)),
	CONSTRAINT "ck_verification_request__scope_global_empty" CHECK (("cera"."verification_request"."applicability_scope_type" = 'GLOBAL') = ("cera"."verification_request"."applicability_scope_ref" = ''))
);
--> statement-breakpoint
CREATE TABLE "cera"."verification_request_handling" (
	"handling_id" uuid NOT NULL,
	"request_key" varchar(71) NOT NULL,
	"handling_type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"handled_at" timestamp(3) with time zone NOT NULL,
	"note" varchar(500),
	"question_item_id" uuid,
	"resolving_event_id" uuid,
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_verification_request_handling" PRIMARY KEY("handling_id"),
	CONSTRAINT "ck_verification_request_handling__request_key" CHECK ("cera"."verification_request_handling"."request_key" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_verification_request_handling__handling_type" CHECK ("cera"."verification_request_handling"."handling_type" IN ('ACKNOWLEDGED', 'ASSIGNED', 'ASKED_EXTERNAL', 'RESOLVED', 'DISMISSED', 'SNOOZED'))
);
--> statement-breakpoint
ALTER TABLE "cera"."canonical_fact" ADD CONSTRAINT "fk_canonical_fact__winning_event_id" FOREIGN KEY ("winning_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."canonical_fact" ADD CONSTRAINT "fk_canonical_fact__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."conflict" ADD CONSTRAINT "fk_conflict__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."verification_request" ADD CONSTRAINT "fk_verification_request__conflict_id" FOREIGN KEY ("conflict_id") REFERENCES "cera"."conflict"("conflict_id") ON DELETE set null ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."verification_request" ADD CONSTRAINT "fk_verification_request__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."verification_request_handling" ADD CONSTRAINT "fk_verification_request_handling__actor_id" FOREIGN KEY ("actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."verification_request_handling" ADD CONSTRAINT "fk_verification_request_handling__question_item_id" FOREIGN KEY ("question_item_id") REFERENCES "cera"."question_item"("question_item_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."verification_request_handling" ADD CONSTRAINT "fk_verification_request_handling__resolving_event_id" FOREIGN KEY ("resolving_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_canonical_fact__fact_name__param_date" ON "cera"."canonical_fact" USING btree ("fact_name","param_date");--> statement-breakpoint
CREATE INDEX "ix_canonical_fact__winning_event_id" ON "cera"."canonical_fact" USING btree ("winning_event_id");--> statement-breakpoint
CREATE INDEX "ix_canonical_fact__not_usable" ON "cera"."canonical_fact" USING btree ("decision_usability") WHERE "cera"."canonical_fact"."decision_usability" <> 'USABLE';--> statement-breakpoint
CREATE INDEX "ix_conflict__coordinate" ON "cera"."conflict" USING btree ("entity_type","entity_id","fact_key","applicability_scope_type","applicability_scope_ref","is_simulated");--> statement-breakpoint
CREATE INDEX "ix_verification_request__coordinate" ON "cera"."verification_request" USING btree ("entity_type","entity_id","fact_key","applicability_scope_type","applicability_scope_ref");--> statement-breakpoint
CREATE INDEX "ix_verification_request__current_status" ON "cera"."verification_request" USING btree ("current_status");--> statement-breakpoint
CREATE INDEX "ix_verification_request_handling__request_key__handled_at" ON "cera"."verification_request_handling" USING btree ("request_key","handled_at");