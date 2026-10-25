CREATE TABLE "advance_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "advance_requests_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"recipient_id" varchar(36) NOT NULL,
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
	CONSTRAINT "advance_requests_number_unique" UNIQUE("number"),
	CONSTRAINT "advance_requests_amount_positive" CHECK ("advance_requests"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"settlement_due_days" integer DEFAULT 3 NOT NULL,
	"return_due_days" integer DEFAULT 3 NOT NULL,
	"no_receipt_max_amount" bigint DEFAULT 50000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" varchar(36),
	CONSTRAINT "company_settings_single_row" CHECK ("company_settings"."id" = 1),
	CONSTRAINT "company_settings_settlement_due_days" CHECK ("company_settings"."settlement_due_days" between 1 and 60),
	CONSTRAINT "company_settings_return_due_days" CHECK ("company_settings"."return_due_days" between 1 and 60),
	CONSTRAINT "company_settings_no_receipt_max" CHECK ("company_settings"."no_receipt_max_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_disbursed_by_id_users_id_fk" FOREIGN KEY ("disbursed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_requests_recipient_idx" ON "advance_requests" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "advance_requests_status_idx" ON "advance_requests" USING btree ("status","created_at");--> statement-breakpoint
-- Ditambahkan manual: baris pengaturan perusahaan dengan nilai default
-- (nota 3 hari, pengembalian 3 hari, tanpa nota maks. Rp50.000).
INSERT INTO "company_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
