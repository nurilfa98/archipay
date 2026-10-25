CREATE TABLE "reminder_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"advance_id" varchar(36) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "method" varchar(20);--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "reference" varchar(100);--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "payroll_period" varchar(7);--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_advance_id_advance_requests_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_logs_advance_kind_unique" ON "reminder_logs" USING btree ("advance_id","kind");--> statement-breakpoint
CREATE INDEX "advance_ledger_entries_payroll_idx" ON "advance_ledger_entries" USING btree ("payroll_period");