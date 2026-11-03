CREATE TABLE "digest_logs" (
	"user_id" varchar(36) NOT NULL,
	"digest_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_logs_user_id_digest_date_pk" PRIMARY KEY("user_id","digest_date")
);
--> statement-breakpoint
ALTER TABLE "digest_logs" ADD CONSTRAINT "digest_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;