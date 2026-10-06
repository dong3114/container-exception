CREATE TABLE "cera"."planning_snapshot" (
	"snapshot_id" uuid NOT NULL,
	"as_of" timestamp(3) with time zone NOT NULL,
	"fact_fingerprint" varchar(71) NOT NULL,
	"rule_version" varchar(20) NOT NULL,
	"tariff_version" varchar(20) NOT NULL,
	"policy_version" varchar(20) NOT NULL,
	"scope_ref" jsonb,
	"contains_simulated" boolean NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"scenario_id" uuid,
	CONSTRAINT "pk_planning_snapshot" PRIMARY KEY("snapshot_id"),
	CONSTRAINT "uq_planning_snapshot__snapshot_id__contains_simulated" UNIQUE("snapshot_id","contains_simulated"),
	CONSTRAINT "ck_planning_snapshot__fact_fingerprint" CHECK ("cera"."planning_snapshot"."fact_fingerprint" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_planning_snapshot__scenario_simulated" CHECK ("cera"."planning_snapshot"."scenario_id" IS NULL OR "cera"."planning_snapshot"."contains_simulated"),
	CONSTRAINT "ck_planning_snapshot__scope_ref_object" CHECK (jsonb_typeof("cera"."planning_snapshot"."scope_ref") = 'object')
);
--> statement-breakpoint
CREATE TABLE "cera"."recovery_run" (
	"run_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_ref" varchar(60),
	"previous_run_id" uuid,
	"objective_version" varchar(20) NOT NULL,
	"run_status" text NOT NULL,
	"unmet_constraints" jsonb,
	"total_cost_krw" bigint,
	"solve_ms" integer,
	"contains_simulated" boolean NOT NULL,
	"executed_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_recovery_run" PRIMARY KEY("run_id"),
	CONSTRAINT "ck_recovery_run__trigger_type" CHECK ("cera"."recovery_run"."trigger_type" IN ('EXCEPTION_DETECTED', 'OPERATOR_REQUEST', 'FACT_CORRECTION', 'CONSTRAINT_CHANGE', 'REPLY_RECEIVED', 'SCHEDULED')),
	CONSTRAINT "ck_recovery_run__run_status" CHECK ("cera"."recovery_run"."run_status" IN ('FEASIBLE', 'INFEASIBLE', 'TIMEOUT', 'ERROR')),
	CONSTRAINT "ck_recovery_run__previous_not_self" CHECK ("cera"."recovery_run"."previous_run_id" <> "cera"."recovery_run"."run_id"),
	CONSTRAINT "ck_recovery_run__infeasible_unmet" CHECK ("cera"."recovery_run"."run_status" <> 'INFEASIBLE' OR "cera"."recovery_run"."unmet_constraints" IS NOT NULL),
	CONSTRAINT "ck_recovery_run__total_cost_krw" CHECK ("cera"."recovery_run"."total_cost_krw" >= 0),
	CONSTRAINT "ck_recovery_run__solve_ms" CHECK ("cera"."recovery_run"."solve_ms" >= 0),
	CONSTRAINT "ck_recovery_run__unmet_constraints_array" CHECK (jsonb_typeof("cera"."recovery_run"."unmet_constraints") = 'array')
);
--> statement-breakpoint
ALTER TABLE "cera"."planning_snapshot" ADD CONSTRAINT "fk_planning_snapshot__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_run" ADD CONSTRAINT "fk_recovery_run__snapshot_id__contains_simulated" FOREIGN KEY ("snapshot_id","contains_simulated") REFERENCES "cera"."planning_snapshot"("snapshot_id","contains_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_run" ADD CONSTRAINT "fk_recovery_run__previous_run_id" FOREIGN KEY ("previous_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_recovery_run__previous_run_id" ON "cera"."recovery_run" USING btree ("previous_run_id");--> statement-breakpoint
CREATE INDEX "ix_recovery_run__snapshot_id" ON "cera"."recovery_run" USING btree ("snapshot_id");