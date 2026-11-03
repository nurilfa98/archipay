CREATE TABLE "leave_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"number" varchar(20) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"leave_type_id" varchar(36) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"is_paid" boolean NOT NULL,
	"uses_quota" boolean NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" integer NOT NULL,
	"time_minute" integer,
	"reason" varchar(500) NOT NULL,
	"attachment_key" varchar(255),
	"attachment_type" varchar(50),
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"decided_by_id" varchar(36),
	"decided_at" timestamp with time zone,
	"decided_by_delegate" boolean DEFAULT false NOT NULL,
	"reject_reason" varchar(300),
	"cancelled_at" timestamp with time zone,
	"delegate_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_requests_status" CHECK ("leave_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
	CONSTRAINT "leave_requests_dates" CHECK ("leave_requests"."end_date" >= "leave_requests"."start_date")
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"name" varchar(60) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"uses_quota" boolean DEFAULT false NOT NULL,
	"attachment" varchar(10) DEFAULT 'NONE' NOT NULL,
	"backdate_days" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_kind" CHECK ("leave_types"."kind" IN ('FULL_DAY', 'LATE_ARRIVAL', 'EARLY_LEAVE')),
	CONSTRAINT "leave_types_attachment" CHECK ("leave_types"."attachment" IN ('NONE', 'OPTIONAL', 'REQUIRED')),
	CONSTRAINT "leave_types_backdate" CHECK ("leave_types"."backdate_days" between 0 and 30)
);
--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD COLUMN "waived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD COLUMN "waived_by_id" varchar(36);--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD COLUMN "waive_note" varchar(300);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "annual_leave_quota" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "leave_delegation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "leave_delegation_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "annual_leave_quota" integer;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leave_requests_company_number_unique" ON "leave_requests" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "leave_requests_company_status_idx" ON "leave_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "leave_requests_user_dates_idx" ON "leave_requests" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_company_name_unique" ON "leave_types" USING btree ("company_id","name");--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD CONSTRAINT "attendance_penalties_waived_by_id_users_id_fk" FOREIGN KEY ("waived_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_leave_quota" CHECK ("company_settings"."annual_leave_quota" between 0 and 60);--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_leave_delegation" CHECK ("company_settings"."leave_delegation_hours" between 1 and 168);--> statement-breakpoint
-- Ditambahkan manual: jenis cuti/izin bawaan untuk company yang sudah ada
-- (company baru mendapatnya dari features/companies/actions.ts). Sama dengan
-- DEFAULT_LEAVE_TYPES di features/attendance/constants.ts.
INSERT INTO "leave_types" ("id", "company_id", "name", "kind", "is_paid", "uses_quota", "attachment", "backdate_days", "sort_order")
SELECT gen_random_uuid()::text, c."id", v.name, v.kind, v.is_paid, v.uses_quota, v.attachment, v.backdate_days, v.sort_order
FROM "companies" c
CROSS JOIN (VALUES
  ('Cuti tahunan', 'FULL_DAY', true, true, 'NONE', 0, 1),
  ('Sakit', 'FULL_DAY', true, false, 'OPTIONAL', 3, 2),
  ('Izin (keperluan pribadi)', 'FULL_DAY', true, false, 'NONE', 3, 3),
  ('Izin tidak dibayar', 'FULL_DAY', false, false, 'NONE', 0, 4),
  ('Cuti khusus (menikah, melahirkan, duka)', 'FULL_DAY', true, false, 'OPTIONAL', 3, 5),
  ('Izin datang terlambat', 'LATE_ARRIVAL', true, false, 'NONE', 0, 6),
  ('Izin pulang cepat', 'EARLY_LEAVE', true, false, 'NONE', 0, 7)
) AS v(name, kind, is_paid, uses_quota, attachment, backdate_days, sort_order)
ON CONFLICT DO NOTHING;
