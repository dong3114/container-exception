CREATE TABLE "cera"."agent_run" (
	"agent_run_id" uuid NOT NULL,
	"recovery_run_id" uuid NOT NULL,
	"goal" varchar(300) NOT NULL,
	"status" text NOT NULL,
	"created_by_actor_id" uuid NOT NULL,
	"agent_actor_id" uuid NOT NULL,
	"runtime_version" varchar(40),
	"trace_id" varchar(64),
	"started_at" timestamp(3) with time zone NOT NULL,
	"finished_at" timestamp(3) with time zone,
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_agent_run" PRIMARY KEY("agent_run_id"),
	CONSTRAINT "ck_agent_run__status" CHECK ("cera"."agent_run"."status" IN ('ACTIVE', 'FINISHED', 'CANCELLED')),
	CONSTRAINT "ck_agent_run__finished_shape" CHECK (("cera"."agent_run"."status" = 'ACTIVE') = ("cera"."agent_run"."finished_at" IS NULL)),
	CONSTRAINT "ck_agent_run__finished_after_started" CHECK ("cera"."agent_run"."finished_at" IS NULL OR "cera"."agent_run"."finished_at" >= "cera"."agent_run"."started_at")
);
--> statement-breakpoint
CREATE TABLE "cera"."agent_tool_call" (
	"tool_call_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"tool_name" varchar(60) NOT NULL,
	"tool_version" varchar(10) NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" varchar(100),
	"input_hash" varchar(71) NOT NULL,
	"output_hash" varchar(71),
	"result_ref_type" varchar(40),
	"result_ref_id" uuid,
	"error_code" varchar(60),
	"started_at" timestamp(3) with time zone NOT NULL,
	"finished_at" timestamp(3) with time zone,
	"duration_ms" integer,
	"request_id" varchar(64),
	"trace_id" varchar(64),
	CONSTRAINT "pk_agent_tool_call" PRIMARY KEY("tool_call_id"),
	CONSTRAINT "ck_agent_tool_call__category" CHECK ("cera"."agent_tool_call"."category" IN ('READ', 'EXTERNAL_READ', 'COMPUTE', 'PROPOSE', 'REQUEST')),
	CONSTRAINT "ck_agent_tool_call__status" CHECK ("cera"."agent_tool_call"."status" IN ('STARTED', 'SUCCEEDED', 'FAILED', 'REJECTED')),
	CONSTRAINT "ck_agent_tool_call__input_hash" CHECK ("cera"."agent_tool_call"."input_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_agent_tool_call__output_hash" CHECK ("cera"."agent_tool_call"."output_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_agent_tool_call__tool_name" CHECK ("cera"."agent_tool_call"."tool_name" ~ '^[a-z][a-z0-9_]{1,59}$'),
	CONSTRAINT "ck_agent_tool_call__idempotency_key" CHECK ("cera"."agent_tool_call"."idempotency_key" ~ '^[A-Za-z0-9._:-]{1,100}$'),
	CONSTRAINT "ck_agent_tool_call__finished_shape" CHECK (("cera"."agent_tool_call"."status" = 'STARTED') = ("cera"."agent_tool_call"."finished_at" IS NULL AND "cera"."agent_tool_call"."duration_ms" IS NULL)),
	CONSTRAINT "ck_agent_tool_call__error_shape" CHECK (("cera"."agent_tool_call"."status" IN ('FAILED', 'REJECTED')) = ("cera"."agent_tool_call"."error_code" IS NOT NULL)),
	CONSTRAINT "ck_agent_tool_call__result_ref_pair" CHECK (("cera"."agent_tool_call"."result_ref_type" IS NULL) = ("cera"."agent_tool_call"."result_ref_id" IS NULL)),
	CONSTRAINT "ck_agent_tool_call__duration" CHECK ("cera"."agent_tool_call"."duration_ms" IS NULL OR "cera"."agent_tool_call"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "fk_agent_run__recovery_run_id" FOREIGN KEY ("recovery_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "fk_agent_run__created_by_actor_id" FOREIGN KEY ("created_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "fk_agent_run__agent_actor_id" FOREIGN KEY ("agent_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."agent_tool_call" ADD CONSTRAINT "fk_agent_tool_call__agent_run_id" FOREIGN KEY ("agent_run_id") REFERENCES "cera"."agent_run"("agent_run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_agent_run__recovery_run_id" ON "cera"."agent_run" USING btree ("recovery_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_tool_call__run_tool_idempotency_key" ON "cera"."agent_tool_call" USING btree ("agent_run_id","tool_name","idempotency_key") WHERE "cera"."agent_tool_call"."idempotency_key" IS NOT NULL AND "cera"."agent_tool_call"."status" IN ('STARTED', 'SUCCEEDED');--> statement-breakpoint
CREATE INDEX "ix_agent_tool_call__agent_run_id__started_at" ON "cera"."agent_tool_call" USING btree ("agent_run_id","started_at");