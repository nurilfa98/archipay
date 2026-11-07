CREATE TABLE "overtime_orders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"work_date" date NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"reason" varchar(500) NOT NULL,
	"source" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"requested_by_id" varchar(36) NOT NULL,
	"decided_by_id" varchar(36),
	"decided_at" timestamp with time zone,
	"decided_by_delegate" boolean DEFAULT false NOT NULL,
	"reject_reason" varchar(300),
	"decline_reason" varchar(300),
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overtime_orders_source" CHECK ("overtime_orders"."source" IN ('REQUEST', 'ASSIGNED')),
	CONSTRAINT "overtime_orders_status" CHECK ("overtime_orders"."status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DECLINED')),
	CONSTRAINT "overtime_orders_minutes" CHECK ("overtime_orders"."start_minute" between 0 and 1439 AND "overtime_orders"."end_minute" between 1 and 1440 AND "overtime_orders"."end_minute" > "overtime_orders"."start_minute")
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "overtime_order_id" varchar(36);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "attendance_overtime_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "payroll_overtime_method" varchar(20) DEFAULT 'GOVERNMENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_profiles" ADD COLUMN "overtime_hourly_rate" bigint;--> statement-breakpoint
ALTER TABLE "overtime_orders" ADD CONSTRAINT "overtime_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_orders" ADD CONSTRAINT "overtime_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_orders" ADD CONSTRAINT "overtime_orders_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_orders" ADD CONSTRAINT "overtime_orders_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overtime_orders_company_status_idx" ON "overtime_orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "overtime_orders_user_date_idx" ON "overtime_orders" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "overtime_orders_one_active" ON "overtime_orders" USING btree ("user_id","work_date") WHERE "overtime_orders"."status" IN ('PENDING', 'APPROVED');--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_overtime_order_id_overtime_orders_id_fk" FOREIGN KEY ("overtime_order_id") REFERENCES "public"."overtime_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_overtime_method" CHECK ("company_settings"."payroll_overtime_method" IN ('GOVERNMENT', 'CUSTOM'));--> statement-breakpoint
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_overtime_rate" CHECK ("salary_profiles"."overtime_hourly_rate" IS NULL OR "salary_profiles"."overtime_hourly_rate" >= 0);