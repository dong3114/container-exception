CREATE TABLE "cera"."plan_follow_up" (
	"follow_up_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"action_key" varchar(120) NOT NULL,
	"message_id" uuid NOT NULL,
	"created_by_actor_id" uuid NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_plan_follow_up" PRIMARY KEY("follow_up_id"),
	CONSTRAINT "uq_plan_follow_up__plan_id__action_key" UNIQUE("plan_id","action_key"),
	CONSTRAINT "uq_plan_follow_up__message_id" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "cera"."plan_follow_up" ADD CONSTRAINT "fk_plan_follow_up__plan_id" FOREIGN KEY ("plan_id") REFERENCES "cera"."recovery_plan"("plan_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."plan_follow_up" ADD CONSTRAINT "fk_plan_follow_up__message_id" FOREIGN KEY ("message_id") REFERENCES "cera"."comm_message"("message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."plan_follow_up" ADD CONSTRAINT "fk_plan_follow_up__created_by_actor_id" FOREIGN KEY ("created_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_plan_follow_up__plan_id" ON "cera"."plan_follow_up" USING btree ("plan_id");