CREATE TABLE "payroll_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"period" varchar(7) NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"pay_date" date,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_id" varchar(36),
	"created_by_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_status" CHECK ("payroll_runs"."status" IN ('DRAFT', 'FINALIZED'))
);
--> statement-breakpoint
CREATE TABLE "payslip_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"payslip_id" varchar(36) NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"type" varchar(10) NOT NULL,
	"source" varchar(20) NOT NULL,
	"label" varchar(150) NOT NULL,
	"amount" bigint NOT NULL,
	"ref_id" varchar(36),
	"edited" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payslip_lines_type" CHECK ("payslip_lines"."type" IN ('EARNING', 'DEDUCTION')),
	CONSTRAINT "payslip_lines_amount" CHECK ("payslip_lines"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"bank_name" varchar(50),
	"bank_account_number" varchar(50),
	"working_days" smallint DEFAULT 0 NOT NULL,
	"present_days" smallint,
	"absent_days" smallint,
	"unpaid_leave_days" smallint,
	"daily_rate" bigint,
	"total_earnings" bigint DEFAULT 0 NOT NULL,
	"total_deductions" bigint DEFAULT 0 NOT NULL,
	"net_pay" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_components" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" varchar(10) NOT NULL,
	"name" varchar(60) NOT NULL,
	"amount" bigint NOT NULL,
	"per_day" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_components_type" CHECK ("salary_components"."type" IN ('ALLOWANCE', 'DEDUCTION')),
	CONSTRAINT "salary_components_amount" CHECK ("salary_components"."amount" > 0),
	CONSTRAINT "salary_components_per_day" CHECK (NOT "salary_components"."per_day" OR "salary_components"."type" = 'ALLOWANCE')
);
--> statement-breakpoint
CREATE TABLE "salary_profiles" (
	"user_id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"base_salary" bigint NOT NULL,
	"daily_rate" bigint,
	"start_date" date,
	"end_date" date,
	"absence_exempt" boolean DEFAULT false NOT NULL,
	"updated_by_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_profiles_amounts" CHECK ("salary_profiles"."base_salary" >= 0 AND ("salary_profiles"."daily_rate" IS NULL OR "salary_profiles"."daily_rate" >= 0)),
	CONSTRAINT "salary_profiles_dates" CHECK ("salary_profiles"."end_date" IS NULL OR "salary_profiles"."start_date" IS NULL OR "salary_profiles"."end_date" >= "salary_profiles"."start_date")
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "payroll_absence_deduction" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "payroll_daily_rate_method" varchar(20) DEFAULT 'WORKING_DAYS' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "payroll_daily_divisor" smallint DEFAULT 26 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "payroll_deduction_base" varchar(20) DEFAULT 'BASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "payroll_user_price" bigint DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payroll" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalized_by_id_users_id_fk" FOREIGN KEY ("finalized_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_company_period_unique" ON "payroll_runs" USING btree ("company_id","period");--> statement-breakpoint
CREATE INDEX "payslip_lines_payslip_idx" ON "payslip_lines" USING btree ("payslip_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_run_user_unique" ON "payslips" USING btree ("run_id","user_id");--> statement-breakpoint
CREATE INDEX "payslips_user_idx" ON "payslips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "salary_components_user_idx" ON "salary_components" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "salary_profiles_company_idx" ON "salary_profiles" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_payroll_method" CHECK ("company_settings"."payroll_daily_rate_method" IN ('WORKING_DAYS', 'FIXED_DIVISOR', 'FIXED_AMOUNT'));--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_payroll_divisor" CHECK ("company_settings"."payroll_daily_divisor" between 1 and 31);--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_payroll_base" CHECK ("company_settings"."payroll_deduction_base" IN ('BASE', 'BASE_ALLOWANCES'));--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_payroll_price_check" CHECK ("platform_settings"."payroll_user_price" >= 0);