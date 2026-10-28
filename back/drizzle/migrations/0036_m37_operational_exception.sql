CREATE TABLE "cera"."operational_exception" (
	"exception_id" uuid NOT NULL,
	"exception_type" text NOT NULL,
	"scope" text NOT NULL,
	"scenario_id" uuid,
	"facility_id" uuid NOT NULL,
	"window_day" date NOT NULL,
	"status" text NOT NULL,
	"basis" text NOT NULL,
	"scheduled_demand" integer NOT NULL,
	"capacity" integer,
	"shortage" integer NOT NULL,
	"recovery_run_id" uuid,
	"is_simulated" boolean NOT NULL,
	"detected_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"resolved_at" timestamp(3) with time zone,
	CONSTRAINT "pk_operational_exception" PRIMARY KEY("exception_id"),
	CONSTRAINT "uq_operational_exception__recovery_run_id" UNIQUE("recovery_run_id"),
	CONSTRAINT "ck_operational_exception__exception_type" CHECK ("cera"."operational_exception"."exception_type" IN ('WAREHOUSE_CAPACITY_SHORTAGE')),
	CONSTRAINT "ck_operational_exception__scope" CHECK ("cera"."operational_exception"."scope" IN ('LIVE', 'SCENARIO')),
	CONSTRAINT "ck_operational_exception__status" CHECK ("cera"."operational_exception"."status" IN ('ACTIVE', 'RESOLVED')),
	CONSTRAINT "ck_operational_exception__basis" CHECK ("cera"."operational_exception"."basis" IN ('CONFIRMED', 'PROVISIONAL')),
	CONSTRAINT "ck_operational_exception__scope_scenario" CHECK (("cera"."operational_exception"."scope" = 'SCENARIO') = ("cera"."operational_exception"."scenario_id" IS NOT NULL) AND ("cera"."operational_exception"."scope" = 'SCENARIO') = "cera"."operational_exception"."is_simulated"),
	CONSTRAINT "ck_operational_exception__numbers" CHECK ("cera"."operational_exception"."scheduled_demand" >= 0 AND ("cera"."operational_exception"."capacity" IS NULL OR "cera"."operational_exception"."capacity" >= 0) AND "cera"."operational_exception"."shortage" >= 0),
	CONSTRAINT "ck_operational_exception__resolved" CHECK (("cera"."operational_exception"."status" = 'RESOLVED') = ("cera"."operational_exception"."resolved_at" IS NOT NULL)),
	CONSTRAINT "ck_operational_exception__time_order" CHECK ("cera"."operational_exception"."updated_at" >= "cera"."operational_exception"."detected_at" AND ("cera"."operational_exception"."resolved_at" IS NULL OR "cera"."operational_exception"."resolved_at" >= "cera"."operational_exception"."detected_at"))
);
--> statement-breakpoint
CREATE TABLE "cera"."operational_exception_observation" (
	"observation_id" uuid NOT NULL,
	"exception_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"as_of" timestamp(3) with time zone NOT NULL,
	"observed_at" timestamp(3) with time zone NOT NULL,
	"scheduled_demand" integer NOT NULL,
	"capacity" integer,
	"capacity_state" text NOT NULL,
	"capacity_event_id" uuid,
	"shortage" integer NOT NULL,
	"evidence" jsonb NOT NULL,
	"evidence_hash" varchar(71) NOT NULL,
	CONSTRAINT "pk_operational_exception_observation" PRIMARY KEY("observation_id"),
	CONSTRAINT "ck_operational_exception_observation__kind" CHECK ("cera"."operational_exception_observation"."kind" IN ('DETECTED', 'CHANGED', 'RESOLVED', 'INDETERMINATE')),
	CONSTRAINT "ck_operational_exception_observation__evidence_hash" CHECK ("cera"."operational_exception_observation"."evidence_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_operational_exception_observation__numbers" CHECK ("cera"."operational_exception_observation"."scheduled_demand" >= 0 AND ("cera"."operational_exception_observation"."capacity" IS NULL OR "cera"."operational_exception_observation"."capacity" >= 0) AND "cera"."operational_exception_observation"."shortage" >= 0),
	CONSTRAINT "ck_operational_exception_observation__capacity_state" CHECK ("cera"."operational_exception_observation"."capacity_state" ~ '^[A-Z][A-Z_]*$')
);
--> statement-breakpoint
ALTER TABLE "cera"."planning_input_batch" DROP CONSTRAINT "ck_planning_input_batch__run_scope";--> statement-breakpoint
ALTER TABLE "cera"."planning_container_record" ALTER COLUMN "recovery_run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cera"."operational_exception" ADD CONSTRAINT "fk_operational_exception__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."operational_exception" ADD CONSTRAINT "fk_operational_exception__facility_id" FOREIGN KEY ("facility_id") REFERENCES "cera"."facility"("facility_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."operational_exception" ADD CONSTRAINT "fk_operational_exception__recovery_run_id" FOREIGN KEY ("recovery_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."operational_exception_observation" ADD CONSTRAINT "fk_operational_exception_observation__exception_id" FOREIGN KEY ("exception_id") REFERENCES "cera"."operational_exception"("exception_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."operational_exception_observation" ADD CONSTRAINT "fk_operational_exception_observation__capacity_event_id" FOREIGN KEY ("capacity_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_operational_exception__active_identity" ON "cera"."operational_exception" USING btree ("exception_type","scope",coalesce("scenario_id", '00000000-0000-0000-0000-000000000000'::uuid),"facility_id","window_day") WHERE "cera"."operational_exception"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "ix_operational_exception__status" ON "cera"."operational_exception" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "ix_operational_exception_observation__exception_id" ON "cera"."operational_exception_observation" USING btree ("exception_id","observed_at");--> statement-breakpoint
ALTER TABLE "cera"."planning_input_batch" ADD CONSTRAINT "ck_planning_input_batch__run_scope" CHECK ("cera"."planning_input_batch"."input_kind" = 'CONTAINERS' OR "cera"."planning_input_batch"."recovery_run_id" IS NULL);