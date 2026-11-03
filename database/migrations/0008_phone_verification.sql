CREATE TABLE "phone_verifications" (
	"user_id" varchar(36) PRIMARY KEY NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"send_date" date NOT NULL,
	"send_count" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Ditambahkan manual: nomor WhatsApp yang sudah ada sebelum fitur OTP dianggap
-- terverifikasi, agar pengguna lama tidak diminta OTP (hemat kuota WhatsApp).
-- OTP berlaku untuk pengguna baru dan setiap penggantian nomor.
UPDATE "users" SET "phone_verified_at" = now() WHERE "phone_number" IS NOT NULL;
