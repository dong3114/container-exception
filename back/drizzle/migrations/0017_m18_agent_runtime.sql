CREATE TABLE "cera"."agent_checkpoint" (
	"checkpoint_row_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"checkpoint_ns" varchar(200) DEFAULT '' NOT NULL,
	"checkpoint_id" varchar(64) NOT NULL,
	"parent_checkpoint_id" varchar(64),
	"content_ref" varchar(300) NOT NULL,
	"content_hash" varchar(71) NOT NULL,
	"meta_source" varchar(20),
	"meta_step" integer,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_agent_checkpoint" PRIMARY KEY("checkpoint_row_id"),
	CONSTRAINT "uq_agent_checkpoint__run_ns_checkpoint_id" UNIQUE("agent_run_id","checkpoint_ns","checkpoint_id"),
	CONSTRAINT "ck_agent_checkpoint__content_ref" CHECK ("cera"."agent_checkpoint"."content_ref" ~ '^cref:v1:AGENT_CHECKPOINT:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "ck_agent_checkpoint__content_hash" CHECK ("cera"."agent_checkpoint"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_agent_checkpoint__checkpoint_id" CHECK ("cera"."agent_checkpoint"."checkpoint_id" ~ '^[A-Za-z0-9._:-]{1,64}$'),
	CONSTRAINT "ck_agent_checkpoint__parent_checkpoint_id" CHECK ("cera"."agent_checkpoint"."parent_checkpoint_id" ~ '^[A-Za-z0-9._:-]{1,64}$')
);
--> statement-breakpoint
CREATE TABLE "cera"."agent_checkpoint_write" (
	"agent_run_id" uuid NOT NULL,
	"checkpoint_ns" varchar(200) DEFAULT '' NOT NULL,
	"checkpoint_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"write_idx" integer NOT NULL,
	"task_path" varchar(300) DEFAULT '' NOT NULL,
	"channel" varchar(200) NOT NULL,
	"value_type" varchar(40) NOT NULL,
	"value_b64" text NOT NULL,
	"value_hash" varchar(71) NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_agent_checkpoint_write" PRIMARY KEY("agent_run_id","checkpoint_ns","checkpoint_id","task_id","write_idx"),
	CONSTRAINT "ck_agent_checkpoint_write__value_hash" CHECK ("cera"."agent_checkpoint_write"."value_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_agent_checkpoint_write__value_size" CHECK (length("cera"."agent_checkpoint_write"."value_b64") <= 262144),
	CONSTRAINT "ck_agent_checkpoint_write__value_b64" CHECK ("cera"."agent_checkpoint_write"."value_b64" ~ '^[A-Za-z0-9+/]*={0,2}$')
);
--> statement-breakpoint
CREATE TABLE "cera"."agent_step" (
	"step_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"node" varchar(60),
	"outcome" varchar(60) NOT NULL,
	"detail_code" varchar(60),
	"tool_call_id" uuid,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp(3) with time zone NOT NULL,
	"finished_at" timestamp(3) with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"trace_id" varchar(64),
	CONSTRAINT "pk_agent_step" PRIMARY KEY("step_id"),
	CONSTRAINT "uq_agent_step__agent_run_id__seq" UNIQUE("agent_run_id","seq"),
	CONSTRAINT "ck_agent_step__kind" CHECK ("cera"."agent_step"."kind" IN ('START', 'NODE', 'INTERRUPT', 'RESUME', 'TERMINAL')),
	CONSTRAINT "ck_agent_step__node" CHECK ("cera"."agent_step"."node" ~ '^[a-z][a-z0-9_]{0,59}$'),
	CONSTRAINT "ck_agent_step__outcome" CHECK ("cera"."agent_step"."outcome" ~ '^[A-Z][A-Z0-9_]{0,59}$'),
	CONSTRAINT "ck_agent_step__detail_code" CHECK ("cera"."agent_step"."detail_code" ~ '^[A-Z][A-Z0-9_]{0,59}$'),
	CONSTRAINT "ck_agent_step__node_shape" CHECK (("cera"."agent_step"."kind" = 'NODE') = ("cera"."agent_step"."node" IS NOT NULL)),
	CONSTRAINT "ck_agent_step__seq" CHECK ("cera"."agent_step"."seq" >= 1),
	CONSTRAINT "ck_agent_step__retry_count" CHECK ("cera"."agent_step"."retry_count" >= 0),
	CONSTRAINT "ck_agent_step__duration" CHECK ("cera"."agent_step"."duration_ms" >= 0 AND "cera"."agent_step"."finished_at" >= "cera"."agent_step"."started_at")
);
--> statement-breakpoint
ALTER TABLE "cera"."agent_run" DROP CONSTRAINT "ck_agent_run__status";--> statement-breakpoint
ALTER TABLE "cera"."agent_run" DROP CONSTRAINT "ck_agent_run__finished_shape";--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "parameters" jsonb;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "current_node" varchar(60);--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "waiting_reason" varchar(60);--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "pending_ref_type" varchar(40);--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "pending_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "last_error_code" varchar(60);--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "updated_at" timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "runtime_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "next_attempt_at" timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD COLUMN "result_summary" jsonb;--> statement-breakpoint
-- [사람 검토 · 추가] T-103 실행 상태값(ACTIVE · FINISHED)을 새 생애주기로 옮긴다 — 새 CHECK 를 붙이기 전에.
-- ACTIVE(그래프 없이 만든 실행 — 재개할 checkpoint 가 없다) → CANCELLED, FINISHED → COMPLETED. M17 전이 · 열 가드는 이 한 번만 끈다(M19 가 새 규칙으로 바꾼다).
ALTER TABLE "cera"."agent_run" DISABLE TRIGGER "tg_agent_run__guard_transition";--> statement-breakpoint
ALTER TABLE "cera"."agent_run" DISABLE TRIGGER "tg_agent_run__guard_columns";--> statement-breakpoint
UPDATE "cera"."agent_run" SET "status" = 'CANCELLED', "finished_at" = COALESCE("finished_at", "started_at"), "last_error_code" = 'LEGACY_RUN_CLOSED_BY_M18' WHERE "status" = 'ACTIVE';--> statement-breakpoint
UPDATE "cera"."agent_run" SET "status" = 'COMPLETED' WHERE "status" = 'FINISHED';--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ENABLE TRIGGER "tg_agent_run__guard_transition";--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ENABLE TRIGGER "tg_agent_run__guard_columns";--> statement-breakpoint
ALTER TABLE "cera"."agent_checkpoint" ADD CONSTRAINT "fk_agent_checkpoint__agent_run_id" FOREIGN KEY ("agent_run_id") REFERENCES "cera"."agent_run"("agent_run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."agent_checkpoint_write" ADD CONSTRAINT "fk_agent_checkpoint_write__agent_run_id" FOREIGN KEY ("agent_run_id") REFERENCES "cera"."agent_run"("agent_run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."agent_step" ADD CONSTRAINT "fk_agent_step__agent_run_id" FOREIGN KEY ("agent_run_id") REFERENCES "cera"."agent_run"("agent_run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."agent_step" ADD CONSTRAINT "fk_agent_step__tool_call_id" FOREIGN KEY ("tool_call_id") REFERENCES "cera"."agent_tool_call"("tool_call_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_agent_checkpoint_write__checkpoint" ON "cera"."agent_checkpoint_write" USING btree ("agent_run_id","checkpoint_ns","checkpoint_id");--> statement-breakpoint
CREATE INDEX "ix_agent_run__pending_ref" ON "cera"."agent_run" USING btree ("pending_ref_type","pending_ref_id") WHERE "cera"."agent_run"."pending_ref_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__waiting_shape" CHECK (("cera"."agent_run"."status" IN ('WAITING_HUMAN', 'WAITING_EXTERNAL', 'WAITING_RUNTIME')) = ("cera"."agent_run"."waiting_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__retry_shape" CHECK (("cera"."agent_run"."status" = 'WAITING_RUNTIME') = ("cera"."agent_run"."next_attempt_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__runtime_attempts" CHECK ("cera"."agent_run"."runtime_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__result_summary_object" CHECK (jsonb_typeof("cera"."agent_run"."result_summary") = 'object');--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__pending_ref_pair" CHECK (("cera"."agent_run"."pending_ref_type" IS NULL) = ("cera"."agent_run"."pending_ref_id" IS NULL));--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__parameters_object" CHECK (jsonb_typeof("cera"."agent_run"."parameters") = 'object');--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__status" CHECK ("cera"."agent_run"."status" IN ('CREATED', 'RUNNING', 'WAITING_HUMAN', 'WAITING_EXTERNAL', 'WAITING_RUNTIME', 'COMPLETED', 'FAILED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "cera"."agent_run" ADD CONSTRAINT "ck_agent_run__finished_shape" CHECK (("cera"."agent_run"."status" IN ('COMPLETED', 'FAILED', 'CANCELLED')) = ("cera"."agent_run"."finished_at" IS NOT NULL));