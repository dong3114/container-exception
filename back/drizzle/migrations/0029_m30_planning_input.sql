CREATE TABLE "cera"."facility_planning_profile" (
	"profile_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"accepts" jsonb NOT NULL,
	"open_from_hour" integer NOT NULL,
	"last_departure_hour" integer NOT NULL,
	"trip_hours" integer NOT NULL,
	"max_storage_days" integer,
	"record_status" text NOT NULL,
	"row_no" integer NOT NULL,
	"content_hash" varchar(71) NOT NULL,
	"supersedes_profile_id" uuid,
	"recorded_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_facility_planning_profile" PRIMARY KEY("profile_id"),
	CONSTRAINT "uq_facility_planning_profile__supersedes_profile_id" UNIQUE("supersedes_profile_id"),
	CONSTRAINT "ck_facility_planning_profile__hours" CHECK ("cera"."facility_planning_profile"."open_from_hour" BETWEEN 0 AND 23 AND "cera"."facility_planning_profile"."last_departure_hour" BETWEEN 0 AND 23 AND "cera"."facility_planning_profile"."last_departure_hour" >= "cera"."facility_planning_profile"."open_from_hour"),
	CONSTRAINT "ck_facility_planning_profile__trip_hours" CHECK ("cera"."facility_planning_profile"."trip_hours" BETWEEN 1 AND 24),
	CONSTRAINT "ck_facility_planning_profile__max_storage_days" CHECK ("cera"."facility_planning_profile"."max_storage_days" IS NULL OR "cera"."facility_planning_profile"."max_storage_days" >= 0),
	CONSTRAINT "ck_facility_planning_profile__record_status" CHECK ("cera"."facility_planning_profile"."record_status" IN ('ACTIVE', 'WITHDRAWN')),
	CONSTRAINT "ck_facility_planning_profile__content_hash" CHECK ("cera"."facility_planning_profile"."content_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "cera"."planning_container_record" (
	"record_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"recovery_run_id" uuid NOT NULL,
	"container_no" varchar(11) NOT NULL,
	"container_id" uuid,
	"size_type" text NOT NULL,
	"carrier_code" varchar(20) NOT NULL,
	"priority" text NOT NULL,
	"lfd" date,
	"pickup_ready" boolean NOT NULL,
	"current_terminal" varchar(40) NOT NULL,
	"destination_facility_id" uuid NOT NULL,
	"planned_day" date NOT NULL,
	"planned_depart_hour" integer,
	"alternate_destination_allowed" boolean NOT NULL,
	"record_status" text NOT NULL,
	"row_no" integer NOT NULL,
	"content_hash" varchar(71) NOT NULL,
	"supersedes_record_id" uuid,
	"recorded_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_planning_container_record" PRIMARY KEY("record_id"),
	CONSTRAINT "uq_planning_container_record__supersedes_record_id" UNIQUE("supersedes_record_id"),
	CONSTRAINT "ck_planning_container_record__container_no" CHECK ("cera"."planning_container_record"."container_no" ~ '^[A-Z]{4}[0-9]{7}$'),
	CONSTRAINT "ck_planning_container_record__size_type" CHECK ("cera"."planning_container_record"."size_type" IN ('20DRY', '40DRY', '40HC', '20RF', '40RF', 'OTHER')),
	CONSTRAINT "ck_planning_container_record__content_hash" CHECK ("cera"."planning_container_record"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_planning_container_record__priority" CHECK ("cera"."planning_container_record"."priority" IN ('CRITICAL', 'HIGH', 'NORMAL')),
	CONSTRAINT "ck_planning_container_record__record_status" CHECK ("cera"."planning_container_record"."record_status" IN ('ACTIVE', 'WITHDRAWN')),
	CONSTRAINT "ck_planning_container_record__planned_depart_hour" CHECK ("cera"."planning_container_record"."planned_depart_hour" IS NULL OR "cera"."planning_container_record"."planned_depart_hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE "cera"."planning_input_batch" (
	"batch_id" uuid NOT NULL,
	"input_kind" text NOT NULL,
	"recovery_run_id" uuid,
	"command_id" uuid NOT NULL,
	"submitted_by_actor_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_label" varchar(100),
	"content_hash" varchar(71) NOT NULL,
	"row_count" integer NOT NULL,
	"accepted_count" integer NOT NULL,
	"unchanged_count" integer NOT NULL,
	"submitted_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_planning_input_batch" PRIMARY KEY("batch_id"),
	CONSTRAINT "uq_planning_input_batch__submitted_by_actor_id__command_id" UNIQUE("submitted_by_actor_id","command_id"),
	CONSTRAINT "ck_planning_input_batch__input_kind" CHECK ("cera"."planning_input_batch"."input_kind" IN ('CONTAINERS', 'RATES', 'FACILITY_PROFILES')),
	CONSTRAINT "ck_planning_input_batch__content_hash" CHECK ("cera"."planning_input_batch"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_planning_input_batch__source_type" CHECK ("cera"."planning_input_batch"."source_type" IN ('CSV', 'ROWS')),
	CONSTRAINT "ck_planning_input_batch__run_scope" CHECK (("cera"."planning_input_batch"."input_kind" = 'CONTAINERS') = ("cera"."planning_input_batch"."recovery_run_id" IS NOT NULL)),
	CONSTRAINT "ck_planning_input_batch__counts" CHECK ("cera"."planning_input_batch"."row_count" >= 0 AND "cera"."planning_input_batch"."accepted_count" >= 0 AND "cera"."planning_input_batch"."unchanged_count" >= 0 AND "cera"."planning_input_batch"."accepted_count" + "cera"."planning_input_batch"."unchanged_count" = "cera"."planning_input_batch"."row_count")
);
--> statement-breakpoint
CREATE TABLE "cera"."tariff_rate" (
	"rate_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"rate_type" text NOT NULL,
	"carrier_code" varchar(20),
	"from_ref" varchar(60),
	"to_ref" varchar(60),
	"size_type" text,
	"amount" bigint NOT NULL,
	"unit" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"source_note" varchar(200) NOT NULL,
	"record_status" text NOT NULL,
	"row_no" integer NOT NULL,
	"content_hash" varchar(71) NOT NULL,
	"supersedes_rate_id" uuid,
	"recorded_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_tariff_rate" PRIMARY KEY("rate_id"),
	CONSTRAINT "uq_tariff_rate__supersedes_rate_id" UNIQUE("supersedes_rate_id"),
	CONSTRAINT "ck_tariff_rate__rate_type" CHECK ("cera"."tariff_rate"."rate_type" IN ('DEMURRAGE_PER_DAY', 'TERMINAL_STORAGE_PER_DAY', 'DETENTION_FREE_DAYS', 'TRANSPORT', 'ODCY_HANDLING_IN_OUT', 'ODCY_STORAGE_PER_DAY')),
	CONSTRAINT "ck_tariff_rate__content_hash" CHECK ("cera"."tariff_rate"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_tariff_rate__unit" CHECK ("cera"."tariff_rate"."unit" IN ('KRW', 'DAY')),
	CONSTRAINT "ck_tariff_rate__size_type" CHECK ("cera"."tariff_rate"."size_type" IN ('20DRY', '40DRY', '40HC', '20RF', '40RF', 'OTHER')),
	CONSTRAINT "ck_tariff_rate__amount" CHECK ("cera"."tariff_rate"."amount" >= 0),
	CONSTRAINT "ck_tariff_rate__period" CHECK ("cera"."tariff_rate"."effective_until" IS NULL OR "cera"."tariff_rate"."effective_until" >= "cera"."tariff_rate"."effective_from"),
	CONSTRAINT "ck_tariff_rate__record_status" CHECK ("cera"."tariff_rate"."record_status" IN ('ACTIVE', 'WITHDRAWN'))
);
--> statement-breakpoint
ALTER TABLE "cera"."facility_planning_profile" ADD CONSTRAINT "fk_facility_planning_profile__batch_id" FOREIGN KEY ("batch_id") REFERENCES "cera"."planning_input_batch"("batch_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."facility_planning_profile" ADD CONSTRAINT "fk_facility_planning_profile__facility_id" FOREIGN KEY ("facility_id") REFERENCES "cera"."facility"("facility_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."facility_planning_profile" ADD CONSTRAINT "fk_facility_planning_profile__supersedes_profile_id" FOREIGN KEY ("supersedes_profile_id") REFERENCES "cera"."facility_planning_profile"("profile_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."planning_container_record" ADD CONSTRAINT "fk_planning_container_record__batch_id" FOREIGN KEY ("batch_id") REFERENCES "cera"."planning_input_batch"("batch_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."planning_container_record" ADD CONSTRAINT "fk_planning_container_record__recovery_run_id" FOREIGN KEY ("recovery_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."planning_container_record" ADD CONSTRAINT "fk_planning_container_record__container_id" FOREIGN KEY ("container_id") REFERENCES "cera"."container"("container_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."planning_container_record" ADD CONSTRAINT "fk_planning_container_record__destination_facility_id" FOREIGN KEY ("destination_facility_id") REFERENCES "cera"."facility"("facility_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."planning_container_record" ADD CONSTRAINT "fk_planning_container_record__supersedes_record_id" FOREIGN KEY ("supersedes_record_id") REFERENCES "cera"."planning_container_record"("record_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."planning_input_batch" ADD CONSTRAINT "fk_planning_input_batch__recovery_run_id" FOREIGN KEY ("recovery_run_id") REFERENCES "cera"."recovery_run"("run_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."planning_input_batch" ADD CONSTRAINT "fk_planning_input_batch__submitted_by_actor_id" FOREIGN KEY ("submitted_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."tariff_rate" ADD CONSTRAINT "fk_tariff_rate__batch_id" FOREIGN KEY ("batch_id") REFERENCES "cera"."planning_input_batch"("batch_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."tariff_rate" ADD CONSTRAINT "fk_tariff_rate__supersedes_rate_id" FOREIGN KEY ("supersedes_rate_id") REFERENCES "cera"."tariff_rate"("rate_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_facility_planning_profile__facility_id" ON "cera"."facility_planning_profile" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "ix_planning_container_record__recovery_run_id" ON "cera"."planning_container_record" USING btree ("recovery_run_id","container_no");--> statement-breakpoint
CREATE INDEX "ix_tariff_rate__rate_type" ON "cera"."tariff_rate" USING btree ("rate_type","effective_from");