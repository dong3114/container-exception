CREATE SCHEMA "cera";
--> statement-breakpoint
CREATE TABLE "cera"."actor" (
	"actor_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_actor" PRIMARY KEY("actor_id"),
	CONSTRAINT "ck_actor__actor_type" CHECK ("cera"."actor"."actor_type" IN ('HUMAN', 'SYSTEM', 'AI_AGENT'))
);
--> statement-breakpoint
CREATE TABLE "cera"."audit_log" (
	"audit_id" uuid NOT NULL,
	"occurred_at" timestamp(3) with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar(40) NOT NULL,
	"before_ref" varchar(300),
	"after_ref" varchar(300),
	"request_context" varchar(300),
	"result" text NOT NULL,
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_audit_log" PRIMARY KEY("audit_id"),
	CONSTRAINT "ck_audit_log__action" CHECK ("cera"."audit_log"."action" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_audit_log__target_type" CHECK ("cera"."audit_log"."target_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_audit_log__result" CHECK ("cera"."audit_log"."result" IN ('SUCCESS', 'FAILURE'))
);
--> statement-breakpoint
CREATE TABLE "cera"."scenario" (
	"scenario_id" uuid NOT NULL,
	"scenario_name" varchar(100) NOT NULL,
	"description" varchar(300),
	"data_pack_ref" varchar(300),
	"as_of_base" timestamp(3) with time zone NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_scenario" PRIMARY KEY("scenario_id")
);
--> statement-breakpoint
CREATE TABLE "cera"."system_error" (
	"error_id" uuid NOT NULL,
	"occurred_at" timestamp(3) with time zone NOT NULL,
	"service_name" varchar(60) NOT NULL,
	"component_name" varchar(100) NOT NULL,
	"operation_name" varchar(100) NOT NULL,
	"error_boundary" text NOT NULL,
	"error_category" text NOT NULL,
	"error_code" varchar(60) NOT NULL,
	"safe_error_message" varchar(500) NOT NULL,
	"exception_type" varchar(200),
	"request_id" varchar(64),
	"trace_id" varchar(64),
	"target_system" text,
	"http_status" integer,
	"retryable" boolean NOT NULL,
	"related_entity_type" text,
	"related_entity_id" varchar(40),
	"raw_log_ref" varchar(300),
	"is_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	CONSTRAINT "pk_system_error" PRIMARY KEY("error_id"),
	CONSTRAINT "ck_system_error__error_boundary" CHECK ("cera"."system_error"."error_boundary" IN ('API_REQUEST', 'INTEGRATION', 'BACKGROUND_JOB')),
	CONSTRAINT "ck_system_error__error_category" CHECK ("cera"."system_error"."error_category" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_system_error__target_system" CHECK ("cera"."system_error"."target_system" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_system_error__related_entity_type" CHECK ("cera"."system_error"."related_entity_type" ~ '^[A-Z0-9][A-Z0-9_]*$'),
	CONSTRAINT "ck_system_error__s2_simulated_scenario" CHECK ("cera"."system_error"."is_simulated" = ("cera"."system_error"."scenario_id" IS NOT NULL)),
	CONSTRAINT "ck_system_error__related_entity_pair" CHECK (("cera"."system_error"."related_entity_type" IS NULL) = ("cera"."system_error"."related_entity_id" IS NULL)),
	CONSTRAINT "ck_system_error__http_status" CHECK ("cera"."system_error"."http_status" BETWEEN 100 AND 599)
);
--> statement-breakpoint
ALTER TABLE "cera"."audit_log" ADD CONSTRAINT "fk_audit_log__actor_id" FOREIGN KEY ("actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."system_error" ADD CONSTRAINT "fk_system_error__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_audit_log__content_purged" ON "cera"."audit_log" USING btree ("target_type","target_id") WHERE "cera"."audit_log"."action" = 'CONTENT_PURGED' AND "cera"."audit_log"."result" = 'SUCCESS';--> statement-breakpoint
CREATE INDEX "ix_audit_log__target_type__target_id__occurred_at" ON "cera"."audit_log" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ix_audit_log__occurred_at" ON "cera"."audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ix_system_error__trace_id" ON "cera"."system_error" USING btree ("trace_id") WHERE "cera"."system_error"."trace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_system_error__occurred_at" ON "cera"."system_error" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ix_system_error__error_code__occurred_at" ON "cera"."system_error" USING btree ("error_code","occurred_at");--> statement-breakpoint
CREATE INDEX "ix_system_error__related_entity" ON "cera"."system_error" USING btree ("related_entity_type","related_entity_id");