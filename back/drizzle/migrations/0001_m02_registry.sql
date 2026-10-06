CREATE TABLE "cera"."contact_channel_address" (
	"address_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_type" text NOT NULL,
	"normalized_address" varchar(200) NOT NULL,
	"email_verification_status" text NOT NULL,
	"relationship_status" text NOT NULL,
	"communication_status" text NOT NULL,
	"verified_at" timestamp(3) with time zone,
	"approved_by_actor_id" uuid,
	"approved_at" timestamp(3) with time zone,
	CONSTRAINT "pk_contact_channel_address" PRIMARY KEY("address_id"),
	CONSTRAINT "uq_contact_channel_address__channel_type__normalized_address" UNIQUE("channel_type","normalized_address"),
	CONSTRAINT "uq_contact_channel_address__address_id__channel_type" UNIQUE("address_id","channel_type"),
	CONSTRAINT "ck_contact_channel_address__channel_type" CHECK ("cera"."contact_channel_address"."channel_type" IN ('GMAIL', 'MOCK', 'PORTAL')),
	CONSTRAINT "ck_contact_channel_address__email_verification_status" CHECK ("cera"."contact_channel_address"."email_verification_status" IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED')),
	CONSTRAINT "ck_contact_channel_address__relationship_status" CHECK ("cera"."contact_channel_address"."relationship_status" IN ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "ck_contact_channel_address__communication_status" CHECK ("cera"."contact_channel_address"."communication_status" IN ('ACTIVE', 'PAUSED', 'INACTIVE')),
	CONSTRAINT "ck_contact_channel_address__normalized" CHECK ("cera"."contact_channel_address"."normalized_address" = lower(btrim("cera"."contact_channel_address"."normalized_address"))),
	CONSTRAINT "ck_contact_channel_address__verified_at" CHECK ("cera"."contact_channel_address"."email_verification_status" <> 'VERIFIED' OR "cera"."contact_channel_address"."verified_at" IS NOT NULL),
	CONSTRAINT "ck_contact_channel_address__approved_by" CHECK ("cera"."contact_channel_address"."relationship_status" <> 'APPROVED' OR ("cera"."contact_channel_address"."approved_by_actor_id" IS NOT NULL AND "cera"."contact_channel_address"."approved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cera"."counterparty" (
	"counterparty_id" uuid NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"source_role" text NOT NULL,
	"org_code" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_counterparty" PRIMARY KEY("counterparty_id"),
	CONSTRAINT "ck_counterparty__source_role" CHECK ("cera"."counterparty"."source_role" IN ('TRUCKING', 'ODCY', 'WAREHOUSE', 'SHIPPING_LINE', 'TERMINAL'))
);
--> statement-breakpoint
CREATE TABLE "cera"."counterparty_contact" (
	"contact_id" uuid NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"person_name" varchar(60) NOT NULL,
	"team" varchar(60),
	"note" varchar(200),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_counterparty_contact" PRIMARY KEY("contact_id"),
	CONSTRAINT "uq_counterparty_contact__contact_id__counterparty_id" UNIQUE("contact_id","counterparty_id")
);
--> statement-breakpoint
CREATE TABLE "cera"."facility" (
	"facility_id" uuid NOT NULL,
	"facility_type" text NOT NULL,
	"facility_name" varchar(100) NOT NULL,
	"area" varchar(100),
	"default_open_time" time(0),
	"default_close_time" time(0),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_facility" PRIMARY KEY("facility_id"),
	CONSTRAINT "ck_facility__facility_type" CHECK ("cera"."facility"."facility_type" IN ('WAREHOUSE', 'TERMINAL', 'ODCY'))
);
--> statement-breakpoint
CREATE TABLE "cera"."truck_pool" (
	"truck_pool_id" uuid NOT NULL,
	"pool_name" varchar(100) NOT NULL,
	"ownership" text NOT NULL,
	"owner_counterparty_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_truck_pool" PRIMARY KEY("truck_pool_id"),
	CONSTRAINT "ck_truck_pool__ownership" CHECK ("cera"."truck_pool"."ownership" IN ('OWN', 'PARTNER'))
);
--> statement-breakpoint
ALTER TABLE "cera"."contact_channel_address" ADD CONSTRAINT "fk_contact_channel_address__contact_id" FOREIGN KEY ("contact_id") REFERENCES "cera"."counterparty_contact"("contact_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."contact_channel_address" ADD CONSTRAINT "fk_contact_channel_address__approved_by_actor_id" FOREIGN KEY ("approved_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."counterparty_contact" ADD CONSTRAINT "fk_counterparty_contact__counterparty_id" FOREIGN KEY ("counterparty_id") REFERENCES "cera"."counterparty"("counterparty_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."truck_pool" ADD CONSTRAINT "fk_truck_pool__owner_counterparty_id" FOREIGN KEY ("owner_counterparty_id") REFERENCES "cera"."counterparty"("counterparty_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_contact_channel_address__contact_id" ON "cera"."contact_channel_address" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ix_counterparty_contact__counterparty_id" ON "cera"."counterparty_contact" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "ix_truck_pool__owner_counterparty_id" ON "cera"."truck_pool" USING btree ("owner_counterparty_id");