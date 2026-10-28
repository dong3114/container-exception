CREATE TABLE "cera"."runtime_heartbeat" (
	"component" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"started_at" timestamp(3) with time zone NOT NULL,
	"last_seen_at" timestamp(3) with time zone NOT NULL,
	"last_cycle_ms" integer NOT NULL,
	"last_cycle_errors" integer NOT NULL,
	"queue_consumer" boolean NOT NULL,
	"cycle_detail" jsonb NOT NULL,
	CONSTRAINT "pk_runtime_heartbeat" PRIMARY KEY("component"),
	CONSTRAINT "ck_runtime_heartbeat__component" CHECK ("cera"."runtime_heartbeat"."component" IN ('WORKER')),
	CONSTRAINT "ck_runtime_heartbeat__numbers" CHECK ("cera"."runtime_heartbeat"."last_cycle_ms" >= 0 AND "cera"."runtime_heartbeat"."last_cycle_errors" >= 0),
	CONSTRAINT "ck_runtime_heartbeat__time_order" CHECK ("cera"."runtime_heartbeat"."last_seen_at" >= "cera"."runtime_heartbeat"."started_at")
);
