CREATE TABLE "company_plan_prices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"months" smallint NOT NULL,
	"price" bigint NOT NULL,
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_plan_prices_price_check" CHECK ("company_plan_prices"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_bank_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"bank_name" varchar(50) NOT NULL,
	"account_number" varchar(30) NOT NULL,
	"account_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"admin_phone" varchar(20),
	"qris_image_key" varchar(255),
	"free_days" integer DEFAULT 14 NOT NULL,
	"grace_days" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_free_days_check" CHECK ("platform_settings"."free_days" BETWEEN 0 AND 90),
	CONSTRAINT "platform_settings_grace_days_check" CHECK ("platform_settings"."grace_days" BETWEEN 0 AND 30)
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"subscription_id" varchar(36) NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"status" varchar(20) NOT NULL,
	"proof_key" varchar(255),
	"proof_content_type" varchar(50),
	"note" varchar(255),
	"amount_received" bigint,
	"review_note" varchar(255),
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" varchar(36),
	"created_by_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payments_status_check" CHECK ("subscription_payments"."status" IN ('PENDING', 'ACCEPTED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"months" smallint NOT NULL,
	"price" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_months_unique" UNIQUE("months"),
	CONSTRAINT "subscription_plans_price_check" CHECK ("subscription_plans"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"months" smallint NOT NULL,
	"price" bigint NOT NULL,
	"status" varchar(20) NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"note" varchar(255),
	"rejected_at" timestamp with time zone,
	"rejection_note" varchar(255),
	"created_by_id" varchar(36) NOT NULL,
	"confirmed_by_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" IN ('CLAIMED', 'UNDERPAID', 'ACTIVE', 'REJECTED')),
	CONSTRAINT "subscriptions_months_check" CHECK ("subscriptions"."months" IN (1, 6, 12))
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "subscription_until" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "last_reminder_key" varchar(20);--> statement-breakpoint
-- Company yang sudah ada (data uji Irisan A) mendapat masa gratis 14 hari sejak dibuat, agar tidak langsung terkunci.
UPDATE "companies" SET "subscription_until" = "created_at" + interval '14 days';--> statement-breakpoint
ALTER TABLE "company_plan_prices" ADD CONSTRAINT "company_plan_prices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_plan_prices_company_months_unique" ON "company_plan_prices" USING btree ("company_id","months");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_idx" ON "subscription_payments" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_company_created_at_idx" ON "subscriptions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_company_open_unique" ON "subscriptions" USING btree ("company_id") WHERE "subscriptions"."status" IN ('CLAIMED', 'UNDERPAID');