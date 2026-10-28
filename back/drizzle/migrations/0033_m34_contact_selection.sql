CREATE TABLE "cera"."contact_selection" (
	"selection_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"agent_run_id" uuid,
	"plan_id" uuid,
	"action_key" varchar(120),
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"selected_by_actor_id" uuid NOT NULL,
	"selected_at" timestamp(3) with time zone NOT NULL,
	"note" varchar(200),
	CONSTRAINT "pk_contact_selection" PRIMARY KEY("selection_id"),
	CONSTRAINT "ck_contact_selection__scope_type" CHECK ("cera"."contact_selection"."scope_type" IN ('AGENT_RUN', 'PLAN_FOLLOW_UP')),
	CONSTRAINT "ck_contact_selection__subject_type" CHECK ("cera"."contact_selection"."subject_type" IN ('FACILITY', 'TRUCK_POOL')),
	CONSTRAINT "ck_contact_selection__scope" CHECK (("cera"."contact_selection"."scope_type" = 'AGENT_RUN' AND "cera"."contact_selection"."agent_run_id" IS NOT NULL AND "cera"."contact_selection"."plan_id" IS NULL AND "cera"."contact_selection"."action_key" IS NULL) OR ("cera"."contact_selection"."scope_type" = 'PLAN_FOLLOW_UP' AND "cera"."contact_selection"."plan_id" IS NOT NULL AND "cera"."contact_selection"."action_key" IS NOT NULL AND "cera"."contact_selection"."agent_run_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "cera"."contact_selection" ADD CONSTRAINT "fk_contact_selection__agent_run_id" FOREIGN KEY ("agent_run_id") REFERENCES "cera"."agent_run"("agent_run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."contact_selection" ADD CONSTRAINT "fk_contact_selection__plan_id" FOREIGN KEY ("plan_id") REFERENCES "cera"."recovery_plan"("plan_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."contact_selection" ADD CONSTRAINT "fk_contact_selection__address_id" FOREIGN KEY ("address_id") REFERENCES "cera"."contact_channel_address"("address_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."contact_selection" ADD CONSTRAINT "fk_contact_selection__selected_by_actor_id" FOREIGN KEY ("selected_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_contact_selection__agent_run_id__subject_id" ON "cera"."contact_selection" USING btree ("agent_run_id","subject_id");--> statement-breakpoint
CREATE INDEX "ix_contact_selection__plan_id__action_key" ON "cera"."contact_selection" USING btree ("plan_id","action_key");