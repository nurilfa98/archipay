CREATE TABLE "attendance_periods" (
	"company_id" varchar(36) NOT NULL,
	"period" varchar(7) NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by_id" varchar(36),
	CONSTRAINT "attendance_periods_company_id_period_pk" PRIMARY KEY("company_id","period")
);
--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD COLUMN "deducted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD COLUMN "deducted_by_id" varchar(36);--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD COLUMN "payroll_period" varchar(7);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "correction_note" varchar(500);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "corrected_by_id" varchar(36);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "corrected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_periods" ADD CONSTRAINT "attendance_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_periods" ADD CONSTRAINT "attendance_periods_locked_by_id_users_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD CONSTRAINT "attendance_penalties_deducted_by_id_users_id_fk" FOREIGN KEY ("deducted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_corrected_by_id_users_id_fk" FOREIGN KEY ("corrected_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;