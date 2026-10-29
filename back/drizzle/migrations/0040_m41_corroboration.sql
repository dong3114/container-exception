CREATE TABLE "cera"."corroboration" (
	"corroboration_id" uuid NOT NULL,
	"claim_event_id" uuid NOT NULL,
	"public_event_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"fact_key" text NOT NULL,
	"result" text NOT NULL,
	"reason_code" text NOT NULL,
	"claim_value_text" text,
	"public_value_text" text,
	"difference_minutes" integer,
	"tolerance_minutes" integer,
	"public_freshness" text,
	"evaluated_as_of" timestamp(3) with time zone NOT NULL,
	"rule_version" text NOT NULL,
	"is_simulated" boolean NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_corroboration" PRIMARY KEY("corroboration_id"),
	CONSTRAINT "ck_corroboration__result" CHECK ("cera"."corroboration"."result" IN ('MATCH', 'CONFLICT', 'NO_PUBLIC_EVIDENCE', 'STALE_PUBLIC_EVIDENCE', 'NOT_COMPARABLE')),
	CONSTRAINT "ck_corroboration__public_pair" CHECK (("cera"."corroboration"."result" IN ('MATCH', 'CONFLICT', 'STALE_PUBLIC_EVIDENCE')) = ("cera"."corroboration"."public_event_id" IS NOT NULL)),
	CONSTRAINT "ck_corroboration__reason_code" CHECK ("cera"."corroboration"."reason_code" ~ '^[A-Z][A-Z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "cera"."operational_exception_container" (
	"exception_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"container_ref" text NOT NULL,
	"plan_order" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_operational_exception_container" PRIMARY KEY("observation_id","container_ref"),
	CONSTRAINT "ck_operational_exception_container__plan_order" CHECK ("cera"."operational_exception_container"."plan_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cera"."corroboration" ADD CONSTRAINT "fk_corroboration__claim_event_id" FOREIGN KEY ("claim_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."corroboration" ADD CONSTRAINT "fk_corroboration__public_event_id" FOREIGN KEY ("public_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."operational_exception_container" ADD CONSTRAINT "fk_operational_exception_container__exception_id" FOREIGN KEY ("exception_id") REFERENCES "cera"."operational_exception"("exception_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_corroboration__claim_public_rule" ON "cera"."corroboration" USING btree ("claim_event_id",coalesce("public_event_id", '00000000-0000-0000-0000-000000000000'::uuid),"rule_version");--> statement-breakpoint
CREATE INDEX "ix_corroboration__entity" ON "cera"."corroboration" USING btree ("entity_type","entity_id","fact_key","created_at");--> statement-breakpoint
CREATE INDEX "ix_operational_exception_container__exception" ON "cera"."operational_exception_container" USING btree ("exception_id","created_at");