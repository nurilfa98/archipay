CREATE TABLE "company_pricing" (
	"company_id" varchar(36) PRIMARY KEY NOT NULL,
	"base_price" bigint,
	"included_users" integer,
	"extra_user_price" bigint,
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_pricing_base_price_check" CHECK ("company_pricing"."base_price" IS NULL OR "company_pricing"."base_price" > 0),
	CONSTRAINT "company_pricing_included_users_check" CHECK ("company_pricing"."included_users" IS NULL OR "company_pricing"."included_users" BETWEEN 1 AND 1000),
	CONSTRAINT "company_pricing_extra_user_price_check" CHECK ("company_pricing"."extra_user_price" IS NULL OR "company_pricing"."extra_user_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_months_check";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "months" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "user_limit" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "trial_max_users" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "base_price" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "included_users" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "extra_user_price" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "discount_6" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "discount_12" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "kind" varchar(10) DEFAULT 'PLAN' NOT NULL;--> statement-breakpoint
-- Tagihan uji yang sudah ada dianggap untuk 10 pengguna; setelah itu kolom wajib diisi aplikasi.
ALTER TABLE "subscriptions" ADD COLUMN "users" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "users" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "company_pricing" ADD CONSTRAINT "company_pricing_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_trial_max_users_check" CHECK ("platform_settings"."trial_max_users" BETWEEN 1 AND 1000);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_included_users_check" CHECK ("platform_settings"."included_users" BETWEEN 1 AND 1000);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_prices_check" CHECK ("platform_settings"."base_price" >= 0 AND "platform_settings"."extra_user_price" >= 0);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_discounts_check" CHECK ("platform_settings"."discount_6" BETWEEN 0 AND 90 AND "platform_settings"."discount_12" BETWEEN 0 AND 90);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_kind_check" CHECK (("subscriptions"."kind" = 'PLAN' AND "subscriptions"."months" IN (1, 6, 12)) OR ("subscriptions"."kind" = 'TOPUP' AND "subscriptions"."months" IS NULL));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_users_check" CHECK ("subscriptions"."users" > 0);