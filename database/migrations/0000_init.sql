CREATE TABLE "advance_ledger_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"advance_id" varchar(36) NOT NULL,
	"type" varchar(30) NOT NULL,
	"amount" bigint NOT NULL,
	"settlement_item_id" varchar(36),
	"method" varchar(20),
	"reference" varchar(100),
	"payroll_period" varchar(7),
	"note" varchar(300),
	"created_by_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advance_ledger_entries_amount_nonzero" CHECK ("advance_ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "advance_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"number" varchar(20) NOT NULL,
	"period_year" smallint NOT NULL,
	"period_month" smallint NOT NULL,
	"recipient_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"amount" bigint NOT NULL,
	"purpose" varchar(500) NOT NULL,
	"disbursement_method" varchar(20) NOT NULL,
	"status" varchar(30) NOT NULL,
	"created_by_id" varchar(36) NOT NULL,
	"decided_by_id" varchar(36),
	"decided_at" timestamp with time zone,
	"rejection_reason" varchar(500),
	"disbursed_by_id" varchar(36),
	"disbursed_at" timestamp with time zone,
	"transfer_reference" varchar(100),
	"destination_bank_name" varchar(50),
	"destination_account_number" varchar(50),
	"settlement_due_at" timestamp with time zone,
	"return_due_days" integer,
	"acknowledged_at" timestamp with time zone,
	"acknowledgment_text" text,
	"acknowledgment_ip" varchar(45),
	"acknowledgment_user_agent" varchar(500),
	"disputed_at" timestamp with time zone,
	"dispute_reason" varchar(500),
	"cancelled_by_id" varchar(36),
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advance_requests_amount_positive" CHECK ("advance_requests"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36),
	"user_id" varchar(36),
	"action" varchar(100) NOT NULL,
	"entity_name" varchar(50) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"address" varchar(255),
	"phone_number" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"company_id" varchar(36) PRIMARY KEY NOT NULL,
	"settlement_due_days" integer DEFAULT 3 NOT NULL,
	"return_due_days" integer DEFAULT 3 NOT NULL,
	"no_receipt_max_amount" bigint DEFAULT 50000 NOT NULL,
	"max_overdue_advances" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" varchar(36),
	CONSTRAINT "company_settings_settlement_due_days" CHECK ("company_settings"."settlement_due_days" between 1 and 60),
	CONSTRAINT "company_settings_return_due_days" CHECK ("company_settings"."return_due_days" between 1 and 60),
	CONSTRAINT "company_settings_no_receipt_max" CHECK ("company_settings"."no_receipt_max_amount" >= 0),
	CONSTRAINT "company_settings_max_overdue" CHECK ("company_settings"."max_overdue_advances" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"company_id" varchar(36) NOT NULL,
	"prefix" varchar(10) NOT NULL,
	"period_year" smallint NOT NULL,
	"period_month" smallint NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "document_sequences_company_id_prefix_period_year_period_month_pk" PRIMARY KEY("company_id","prefix","period_year","period_month")
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"name" varchar(50) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(100) NOT NULL,
	"ip_address" varchar(45),
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"client" varchar(120),
	"icon" varchar(30) DEFAULT 'building' NOT NULL,
	"contract_value" bigint,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_by_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_status" CHECK ("projects"."status" in ('ACTIVE', 'COMPLETED')),
	CONSTRAINT "projects_contract_value_positive" CHECK ("projects"."contract_value" is null or "projects"."contract_value" > 0)
);
--> statement-breakpoint
CREATE TABLE "reminder_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"advance_id" varchar(36) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settlement_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"settlement_id" varchar(36) NOT NULL,
	"receipt_date" date NOT NULL,
	"category_id" varchar(36) NOT NULL,
	"description" varchar(200) NOT NULL,
	"amount" bigint NOT NULL,
	"has_receipt" boolean NOT NULL,
	"no_receipt_reason" varchar(200),
	"file_key" varchar(300),
	"file_hash" varchar(64),
	"file_content_type" varchar(50),
	"file_size" integer,
	"verification_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_items_amount_positive" CHECK ("settlement_items"."amount" > 0),
	CONSTRAINT "settlement_items_receipt_file" CHECK ("settlement_items"."has_receipt" = ("settlement_items"."file_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"advance_id" varchar(36) NOT NULL,
	"number" varchar(20),
	"period_year" smallint,
	"period_month" smallint,
	"submitted_at" timestamp with time zone,
	"revision_note" varchar(500),
	"late_reason" varchar(500),
	"revision_requested_by_id" varchar(36),
	"revision_requested_at" timestamp with time zone,
	"verified_by_id" varchar(36),
	"verified_at" timestamp with time zone,
	"approved_amount" bigint,
	"balance_amount" bigint,
	"return_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_advance_id_unique" UNIQUE("advance_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" varchar(36) NOT NULL,
	"role_id" varchar(36) NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36),
	"full_name" varchar(100) NOT NULL,
	"email" varchar(100) NOT NULL,
	"phone_number" varchar(20),
	"password_hash" varchar(255) NOT NULL,
	"bank_account_number" varchar(50),
	"bank_name" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"session_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_advance_id_advance_requests_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_settlement_item_id_settlement_items_id_fk" FOREIGN KEY ("settlement_item_id") REFERENCES "public"."settlement_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_disbursed_by_id_users_id_fk" FOREIGN KEY ("disbursed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_advance_id_advance_requests_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_advance_id_advance_requests_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_revision_requested_by_id_users_id_fk" FOREIGN KEY ("revision_requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_ledger_entries_advance_idx" ON "advance_ledger_entries" USING btree ("advance_id","created_at");--> statement-breakpoint
CREATE INDEX "advance_ledger_entries_payroll_idx" ON "advance_ledger_entries" USING btree ("company_id","payroll_period");--> statement-breakpoint
CREATE UNIQUE INDEX "advance_requests_company_number_unique" ON "advance_requests" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "advance_requests_recipient_idx" ON "advance_requests" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "advance_requests_status_idx" ON "advance_requests" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "advance_requests_period_idx" ON "advance_requests" USING btree ("company_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "advance_requests_project_idx" ON "advance_requests" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_name","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_company_created_at_idx" ON "audit_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_company_name_unique" ON "expense_categories" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_company_name_unique" ON "projects" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_logs_advance_kind_unique" ON "reminder_logs" USING btree ("advance_id","kind");--> statement-breakpoint
CREATE INDEX "settlement_items_settlement_idx" ON "settlement_items" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_items_file_hash_unique" ON "settlement_items" USING btree ("company_id","file_hash") WHERE "settlement_items"."file_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_company_number_unique" ON "settlements" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "settlements_period_idx" ON "settlements" USING btree ("company_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "users_company_id_idx" ON "users" USING btree ("company_id");