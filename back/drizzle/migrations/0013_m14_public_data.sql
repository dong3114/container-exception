CREATE TABLE "cera"."bl" (
	"bl_id" uuid NOT NULL,
	"bl_no" varchar(40) NOT NULL,
	"bl_type" text NOT NULL,
	"parent_bl_id" uuid,
	"bl_year" integer,
	"carrier_counterparty_id" uuid,
	"first_raw_input_id" uuid NOT NULL,
	"is_simulated" boolean NOT NULL,
	"registered_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_bl" PRIMARY KEY("bl_id"),
	CONSTRAINT "uq_bl__bl_type__bl_no__bl_year" UNIQUE NULLS NOT DISTINCT("bl_type","bl_no","bl_year"),
	CONSTRAINT "ck_bl__bl_type" CHECK ("cera"."bl"."bl_type" IN ('MASTER', 'HOUSE', 'UNKNOWN')),
	CONSTRAINT "ck_bl__parent_only_for_house" CHECK ("cera"."bl"."bl_type" = 'HOUSE' OR "cera"."bl"."parent_bl_id" IS NULL),
	CONSTRAINT "ck_bl__parent_not_self" CHECK ("cera"."bl"."parent_bl_id" <> "cera"."bl"."bl_id"),
	CONSTRAINT "ck_bl__bl_no" CHECK ("cera"."bl"."bl_no" ~ '^[A-Z0-9-]{1,40}$')
);
--> statement-breakpoint
CREATE TABLE "cera"."container" (
	"container_id" uuid NOT NULL,
	"container_no" varchar(11) NOT NULL,
	"size_type" text,
	"vessel_call_id" uuid,
	"first_raw_input_id" uuid NOT NULL,
	"is_simulated" boolean NOT NULL,
	"registered_at" timestamp(3) with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_container" PRIMARY KEY("container_id"),
	CONSTRAINT "uq_container__container_no" UNIQUE("container_no"),
	CONSTRAINT "ck_container__container_no" CHECK ("cera"."container"."container_no" ~ '^[A-Z]{3}[UJZ][0-9]{7}$'),
	CONSTRAINT "ck_container__size_type" CHECK ("cera"."container"."size_type" IN ('20DRY', '40DRY', '40HC', '20RF', '40RF', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "cera"."container_bl" (
	"container_id" uuid NOT NULL,
	"bl_id" uuid NOT NULL,
	"link_role" text NOT NULL,
	CONSTRAINT "pk_container_bl" PRIMARY KEY("container_id","bl_id"),
	CONSTRAINT "ck_container_bl__link_role" CHECK ("cera"."container_bl"."link_role" IN ('PRIMARY', 'CONSOLIDATED'))
);
--> statement-breakpoint
CREATE TABLE "cera"."external_identifier" (
	"external_identifier_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"issuing_system" text NOT NULL,
	"id_type" text NOT NULL,
	"id_value" varchar(40) NOT NULL,
	"source_event_id" uuid,
	"source_raw_input_id" uuid NOT NULL,
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_external_identifier" PRIMARY KEY("external_identifier_id"),
	CONSTRAINT "uq_external_identifier__system_type_value" UNIQUE("issuing_system","id_type","id_value"),
	CONSTRAINT "ck_external_identifier__owner_type" CHECK ("cera"."external_identifier"."owner_type" IN ('BL', 'CONTAINER', 'VESSEL_CALL')),
	CONSTRAINT "ck_external_identifier__issuing_system" CHECK ("cera"."external_identifier"."issuing_system" IN ('KCS', 'MOF')),
	CONSTRAINT "ck_external_identifier__id_type" CHECK ("cera"."external_identifier"."id_type" IN ('CARGO_MGMT_NO', 'MANIFEST_NO', 'MSN'))
);
--> statement-breakpoint
CREATE TABLE "cera"."public_data_fetch" (
	"fetch_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"dataset" text NOT NULL,
	"operation" varchar(100) NOT NULL,
	"request_params" jsonb NOT NULL,
	"page_no" integer NOT NULL,
	"mode" text NOT NULL,
	"requested_at" timestamp(3) with time zone NOT NULL,
	"received_at" timestamp(3) with time zone,
	"http_status" integer,
	"result_code" varchar(20),
	"outcome" text NOT NULL,
	"total_count" integer,
	"item_count" integer,
	"raw_input_id" uuid,
	"requested_by_actor_id" uuid NOT NULL,
	"trace_id" varchar(64),
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_public_data_fetch" PRIMARY KEY("fetch_id"),
	CONSTRAINT "uq_public_data_fetch__raw_input_id" UNIQUE("raw_input_id"),
	CONSTRAINT "ck_public_data_fetch__provider" CHECK ("cera"."public_data_fetch"."provider" IN ('DATA_GO_KR', 'UNIPASS')),
	CONSTRAINT "ck_public_data_fetch__dataset" CHECK ("cera"."public_data_fetch"."dataset" IN ('MOF_VESSEL_CALL', 'MOF_CONTAINER_MANIFEST')),
	CONSTRAINT "ck_public_data_fetch__mode" CHECK ("cera"."public_data_fetch"."mode" IN ('LIVE', 'REPLAY')),
	CONSTRAINT "ck_public_data_fetch__outcome" CHECK ("cera"."public_data_fetch"."outcome" IN ('SUCCESS', 'NO_DATA', 'UPSTREAM_ERROR', 'TRANSPORT_ERROR', 'PARSE_ERROR')),
	CONSTRAINT "ck_public_data_fetch__request_params_object" CHECK (jsonb_typeof("cera"."public_data_fetch"."request_params") = 'object'),
	CONSTRAINT "ck_public_data_fetch__replay_is_simulated" CHECK (("cera"."public_data_fetch"."mode" = 'REPLAY') = "cera"."public_data_fetch"."is_simulated"),
	CONSTRAINT "ck_public_data_fetch__transport_error_shape" CHECK (("cera"."public_data_fetch"."outcome" = 'TRANSPORT_ERROR') = ("cera"."public_data_fetch"."raw_input_id" IS NULL AND "cera"."public_data_fetch"."received_at" IS NULL)),
	CONSTRAINT "ck_public_data_fetch__received_after_requested" CHECK ("cera"."public_data_fetch"."received_at" IS NULL OR "cera"."public_data_fetch"."received_at" >= "cera"."public_data_fetch"."requested_at"),
	CONSTRAINT "ck_public_data_fetch__page_no" CHECK ("cera"."public_data_fetch"."page_no" >= 1)
);
--> statement-breakpoint
CREATE TABLE "cera"."vessel_call" (
	"vessel_call_id" uuid NOT NULL,
	"port_authority_code" varchar(3) NOT NULL,
	"call_year" integer NOT NULL,
	"call_seq" integer NOT NULL,
	"call_sign" varchar(10) NOT NULL,
	"vessel_name" varchar(40),
	"first_raw_input_id" uuid NOT NULL,
	"is_simulated" boolean NOT NULL,
	"registered_at" timestamp(3) with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pk_vessel_call" PRIMARY KEY("vessel_call_id"),
	CONSTRAINT "uq_vessel_call__port_year_seq_call_sign" UNIQUE("port_authority_code","call_year","call_seq","call_sign"),
	CONSTRAINT "ck_vessel_call__port_authority_code" CHECK ("cera"."vessel_call"."port_authority_code" ~ '^[0-9]{3}$'),
	CONSTRAINT "ck_vessel_call__call_year" CHECK ("cera"."vessel_call"."call_year" BETWEEN 1990 AND 2999),
	CONSTRAINT "ck_vessel_call__call_seq" CHECK ("cera"."vessel_call"."call_seq" BETWEEN 0 AND 999),
	CONSTRAINT "ck_vessel_call__call_sign" CHECK ("cera"."vessel_call"."call_sign" ~ '^[A-Z0-9]{1,10}$')
);
--> statement-breakpoint
ALTER TABLE "cera"."bl" ADD CONSTRAINT "fk_bl__parent_bl_id" FOREIGN KEY ("parent_bl_id") REFERENCES "cera"."bl"("bl_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."bl" ADD CONSTRAINT "fk_bl__carrier_counterparty_id" FOREIGN KEY ("carrier_counterparty_id") REFERENCES "cera"."counterparty"("counterparty_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."bl" ADD CONSTRAINT "fk_bl__first_raw_input_id__is_simulated" FOREIGN KEY ("first_raw_input_id","is_simulated") REFERENCES "cera"."raw_input"("raw_input_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."container" ADD CONSTRAINT "fk_container__vessel_call_id" FOREIGN KEY ("vessel_call_id") REFERENCES "cera"."vessel_call"("vessel_call_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."container" ADD CONSTRAINT "fk_container__first_raw_input_id__is_simulated" FOREIGN KEY ("first_raw_input_id","is_simulated") REFERENCES "cera"."raw_input"("raw_input_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."container_bl" ADD CONSTRAINT "fk_container_bl__container_id" FOREIGN KEY ("container_id") REFERENCES "cera"."container"("container_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."container_bl" ADD CONSTRAINT "fk_container_bl__bl_id" FOREIGN KEY ("bl_id") REFERENCES "cera"."bl"("bl_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."external_identifier" ADD CONSTRAINT "fk_external_identifier__source_event_id" FOREIGN KEY ("source_event_id") REFERENCES "cera"."event"("event_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."external_identifier" ADD CONSTRAINT "fk_external_identifier__source_raw_input_id__is_simulated" FOREIGN KEY ("source_raw_input_id","is_simulated") REFERENCES "cera"."raw_input"("raw_input_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."public_data_fetch" ADD CONSTRAINT "fk_public_data_fetch__raw_input_id__is_simulated" FOREIGN KEY ("raw_input_id","is_simulated") REFERENCES "cera"."raw_input"("raw_input_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."public_data_fetch" ADD CONSTRAINT "fk_public_data_fetch__requested_by_actor_id" FOREIGN KEY ("requested_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."vessel_call" ADD CONSTRAINT "fk_vessel_call__first_raw_input_id__is_simulated" FOREIGN KEY ("first_raw_input_id","is_simulated") REFERENCES "cera"."raw_input"("raw_input_id","is_simulated") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_container__vessel_call_id" ON "cera"."container" USING btree ("vessel_call_id") WHERE "cera"."container"."vessel_call_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_container_bl__container_id__primary" ON "cera"."container_bl" USING btree ("container_id") WHERE "cera"."container_bl"."link_role" = 'PRIMARY';--> statement-breakpoint
CREATE INDEX "ix_container_bl__bl_id" ON "cera"."container_bl" USING btree ("bl_id");--> statement-breakpoint
CREATE INDEX "ix_external_identifier__owner" ON "cera"."external_identifier" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "ix_public_data_fetch__requested_at" ON "cera"."public_data_fetch" USING btree ("requested_at");