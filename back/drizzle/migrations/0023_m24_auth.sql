CREATE TABLE "cera"."user_account" (
	"user_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"login_id" varchar(60) NOT NULL,
	"role" text NOT NULL,
	"password_hash" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "pk_user_account" PRIMARY KEY("user_id"),
	CONSTRAINT "uq_user_account__actor_id" UNIQUE("actor_id"),
	CONSTRAINT "uq_user_account__login_id" UNIQUE("login_id"),
	CONSTRAINT "ck_user_account__role" CHECK ("cera"."user_account"."role" IN ('ADMIN', 'OPERATOR', 'FIELD_OPERATOR')),
	CONSTRAINT "ck_user_account__login_id_format" CHECK ("cera"."user_account"."login_id" ~ '^[a-z0-9][a-z0-9._@-]{2,59}$'),
	CONSTRAINT "ck_user_account__password_hash_format" CHECK ("cera"."user_account"."password_hash" ~ '^scrypt[$][0-9]+[$][0-9]+[$][0-9]+[$][A-Za-z0-9_-]+[$][A-Za-z0-9_-]+$'),
	CONSTRAINT "ck_user_account__updated_after_created" CHECK ("cera"."user_account"."updated_at" >= "cera"."user_account"."created_at")
);
--> statement-breakpoint
CREATE TABLE "cera"."user_session" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(71) NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"revoked_at" timestamp(3) with time zone,
	CONSTRAINT "pk_user_session" PRIMARY KEY("session_id"),
	CONSTRAINT "uq_user_session__token_hash" UNIQUE("token_hash"),
	CONSTRAINT "ck_user_session__token_hash" CHECK ("cera"."user_session"."token_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "ck_user_session__expires_after_created" CHECK ("cera"."user_session"."expires_at" > "cera"."user_session"."created_at"),
	CONSTRAINT "ck_user_session__revoked_after_created" CHECK ("cera"."user_session"."revoked_at" IS NULL OR "cera"."user_session"."revoked_at" >= "cera"."user_session"."created_at")
);
--> statement-breakpoint
ALTER TABLE "cera"."user_account" ADD CONSTRAINT "fk_user_account__actor_id" FOREIGN KEY ("actor_id") REFERENCES "cera"."actor"("actor_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "cera"."user_session" ADD CONSTRAINT "fk_user_session__user_id" FOREIGN KEY ("user_id") REFERENCES "cera"."user_account"("user_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_user_session__user_id" ON "cera"."user_session" USING btree ("user_id");