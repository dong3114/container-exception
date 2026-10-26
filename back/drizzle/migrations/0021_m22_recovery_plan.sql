CREATE TABLE "cera"."recovery_plan" (
	"plan_id" uuid NOT NULL,
	"case_run_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"plan_status" text NOT NULL,
	"solver_status" text NOT NULL,
	"solver_version" varchar(40) NOT NULL,
	"input_hash" varchar(71) NOT NULL,
	"plan_hash" varchar(71) NOT NULL,
	"objective_krw" bigint,
	"base_cost_krw" bigint,
	"risk_penalty_krw" bigint,
	"baseline_total_krw" bigint NOT NULL,
	"baseline_base_cost_krw" bigint NOT NULL,
	"saving_krw" bigint,
	"base_saving_krw" bigint,
	"candidate_count" integer NOT NULL,
	"result" jsonb NOT NULL,
	"cost_ms" integer NOT NULL,
	"solve_ms" integer NOT NULL,
	"outdated_reasons" jsonb,
	"outdated_at" timestamp(3) with time zone,
	"superseded_by_plan_id" uuid,
	"approved_by_actor_id" uuid,
	"approved_at" timestamp(3) with time zone,
	"created_by_actor_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"contains_simulated" boolean NOT NULL,
	"scenario_id" uuid,
	"created_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_recovery_plan" PRIMARY KEY("plan_id"),
	CONSTRAINT "uq_recovery_plan__case_run_id__version" UNIQUE("case_run_id","version"),
	CONSTRAINT "ck_recovery_plan__plan_status" CHECK ("cera"."recovery_plan"."plan_status" IN ('PROPOSED', 'APPROVED', 'SUPERSEDED', 'OUTDATED', 'INFEASIBLE')),
	CONSTRAINT "ck_recovery_plan__solver_status" CHECK ("cera"."recovery_plan"."solver_status" IN ('OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIME_LIMIT', 'ERROR')),
	CONSTRAINT "ck_recovery_plan__input_hash" CHECK ("cera"."recovery_plan"."input_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_recovery_plan__plan_hash" CHECK ("cera"."recovery_plan"."plan_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_recovery_plan__result_object" CHECK (jsonb_typeof("cera"."recovery_plan"."result") = 'object'),
	CONSTRAINT "ck_recovery_plan__outdated_reasons_array" CHECK (jsonb_typeof("cera"."recovery_plan"."outdated_reasons") = 'array'),
	CONSTRAINT "ck_recovery_plan__version" CHECK ("cera"."recovery_plan"."version" >= 1),
	CONSTRAINT "ck_recovery_plan__amounts" CHECK (("cera"."recovery_plan"."objective_krw" IS NULL OR "cera"."recovery_plan"."objective_krw" >= 0) AND ("cera"."recovery_plan"."base_cost_krw" IS NULL OR "cera"."recovery_plan"."base_cost_krw" >= 0) AND ("cera"."recovery_plan"."risk_penalty_krw" IS NULL OR "cera"."recovery_plan"."risk_penalty_krw" >= 0) AND "cera"."recovery_plan"."baseline_total_krw" >= 0 AND "cera"."recovery_plan"."baseline_base_cost_krw" >= 0),
	CONSTRAINT "ck_recovery_plan__timings" CHECK ("cera"."recovery_plan"."cost_ms" >= 0 AND "cera"."recovery_plan"."solve_ms" >= 0 AND "cera"."recovery_plan"."candidate_count" >= 0),
	CONSTRAINT "ck_recovery_plan__objective_shape" CHECK (("cera"."recovery_plan"."solver_status" IN ('OPTIMAL', 'FEASIBLE', 'TIME_LIMIT')) = ("cera"."recovery_plan"."objective_krw" IS NOT NULL)),
	CONSTRAINT "ck_recovery_plan__infeasible_status" CHECK (("cera"."recovery_plan"."plan_status" <> 'INFEASIBLE' OR "cera"."recovery_plan"."objective_krw" IS NULL) AND ("cera"."recovery_plan"."plan_status" NOT IN ('PROPOSED', 'APPROVED') OR "cera"."recovery_plan"."objective_krw" IS NOT NULL)),
	CONSTRAINT "ck_recovery_plan__approved_shape" CHECK (("cera"."recovery_plan"."approved_by_actor_id" IS NULL) = ("cera"."recovery_plan"."approved_at" IS NULL)),
	CONSTRAINT "ck_recovery_plan__approved_status" CHECK ("cera"."recovery_plan"."plan_status" <> 'APPROVED' OR "cera"."recovery_plan"."approved_by_actor_id" IS NOT NULL),
	CONSTRAINT "ck_recovery_plan__outdated_shape" CHECK (("cera"."recovery_plan"."outdated_at" IS NULL) = ("cera"."recovery_plan"."outdated_reasons" IS NULL)),
	CONSTRAINT "ck_recovery_plan__superseded_shape" CHECK (("cera"."recovery_plan"."plan_status" = 'SUPERSEDED') = ("cera"."recovery_plan"."superseded_by_plan_id" IS NOT NULL)),
	CONSTRAINT "ck_recovery_plan__superseded_not_self" CHECK ("cera"."recovery_plan"."superseded_by_plan_id" <> "cera"."recovery_plan"."plan_id"),
	CONSTRAINT "ck_recovery_plan__scenario_simulated" CHECK ("cera"."recovery_plan"."scenario_id" IS NULL OR "cera"."recovery_plan"."contains_simulated")
);
--> statement-breakpoint
CREATE TABLE "cera"."recovery_plan_item" (
	"plan_id" uuid NOT NULL,
	"container_ref" varchar(40) NOT NULL,
	"action" text NOT NULL,
	"target_ref" varchar(60) NOT NULL,
	"destination_ref" varchar(60) NOT NULL,
	"delivery_day" date NOT NULL,
	"scheduled_at" timestamp(3) with time zone,
	"truck_ref" varchar(120),
	"base_cost_krw" bigint NOT NULL,
	"risk_penalty_krw" bigint NOT NULL,
	"total_krw" bigint NOT NULL,
	"detail" jsonb NOT NULL,
	CONSTRAINT "pk_recovery_plan_item" PRIMARY KEY("plan_id","container_ref"),
	CONSTRAINT "ck_recovery_plan_item__action" CHECK ("cera"."recovery_plan_item"."action" IN ('KEEP_CURRENT_PLAN', 'MOVE_TO_WAREHOUSE', 'MOVE_TO_ODCY', 'WAIT_AT_TERMINAL')),
	CONSTRAINT "ck_recovery_plan_item__detail_object" CHECK (jsonb_typeof("cera"."recovery_plan_item"."detail") = 'object'),
	CONSTRAINT "ck_recovery_plan_item__amounts" CHECK ("cera"."recovery_plan_item"."base_cost_krw" >= 0 AND "cera"."recovery_plan_item"."risk_penalty_krw" >= 0 AND "cera"."recovery_plan_item"."total_krw" = "cera"."recovery_plan_item"."base_cost_krw" + "cera"."recovery_plan_item"."risk_penalty_krw")
);
--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan" ADD CONSTRAINT "fk_recovery_plan__case_run_id" FOREIGN KEY ("case_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan" ADD CONSTRAINT "fk_recovery_plan__snapshot_id__contains_simulated" FOREIGN KEY ("snapshot_id","contains_simulated") REFERENCES "cera"."planning_snapshot"("snapshot_id","contains_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan" ADD CONSTRAINT "fk_recovery_plan__superseded_by_plan_id" FOREIGN KEY ("superseded_by_plan_id") REFERENCES "cera"."recovery_plan"("plan_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan" ADD CONSTRAINT "fk_recovery_plan__approved_by_actor_id" FOREIGN KEY ("approved_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan" ADD CONSTRAINT "fk_recovery_plan__created_by_actor_id" FOREIGN KEY ("created_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan" ADD CONSTRAINT "fk_recovery_plan__agent_run_id" FOREIGN KEY ("agent_run_id") REFERENCES "cera"."agent_run"("agent_run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan" ADD CONSTRAINT "fk_recovery_plan__scenario_id" FOREIGN KEY ("scenario_id") REFERENCES "cera"."scenario"("scenario_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."recovery_plan_item" ADD CONSTRAINT "fk_recovery_plan_item__plan_id" FOREIGN KEY ("plan_id") REFERENCES "cera"."recovery_plan"("plan_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recovery_plan__case_run_id__current" ON "cera"."recovery_plan" USING btree ("case_run_id") WHERE plan_status IN ('PROPOSED', 'APPROVED');--> statement-breakpoint
CREATE INDEX "ix_recovery_plan__snapshot_id" ON "cera"."recovery_plan" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "ix_recovery_plan__agent_run_id" ON "cera"."recovery_plan" USING btree ("agent_run_id");