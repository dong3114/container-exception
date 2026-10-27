CREATE TABLE "cera"."extraction_retry_request" (
	"retry_request_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"requested_by_actor_id" uuid NOT NULL,
	"requested_at" timestamp(3) with time zone NOT NULL,
	"prior_state" text NOT NULL,
	"prior_failed_attempts" integer NOT NULL,
	"note" varchar(200),
	"is_simulated" boolean NOT NULL,
	CONSTRAINT "pk_extraction_retry_request" PRIMARY KEY("retry_request_id"),
	CONSTRAINT "uq_extraction_retry_request__requested_by_actor_id__command_id" UNIQUE("requested_by_actor_id","command_id"),
	CONSTRAINT "ck_extraction_retry_request__prior_state" CHECK ("cera"."extraction_retry_request"."prior_state" IN ('FAILED', 'NO_CANDIDATE', 'DONE')),
	CONSTRAINT "ck_extraction_retry_request__prior_failed_attempts" CHECK ("cera"."extraction_retry_request"."prior_failed_attempts" >= 0),
	CONSTRAINT "ck_extraction_retry_request__note" CHECK ("cera"."extraction_retry_request"."note" IS NULL OR char_length("cera"."extraction_retry_request"."note") >= 1)
);
--> statement-breakpoint
ALTER TABLE "cera"."extraction_retry_request" ADD CONSTRAINT "fk_extraction_retry_request__message_id" FOREIGN KEY ("message_id") REFERENCES "cera"."comm_message"("message_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."extraction_retry_request" ADD CONSTRAINT "fk_extraction_retry_request__requested_by_actor_id" FOREIGN KEY ("requested_by_actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_extraction_retry_request__message_id" ON "cera"."extraction_retry_request" USING btree ("message_id","requested_at");