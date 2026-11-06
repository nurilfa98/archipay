ALTER TABLE "advance_ledger_entries" ADD COLUMN "ack_status" varchar(20);--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "ack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "ack_note" varchar(300);--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "reversal_of" varchar(36);--> statement-breakpoint
CREATE UNIQUE INDEX "advance_ledger_entries_one_reversal" ON "advance_ledger_entries" USING btree ("reversal_of") WHERE "advance_ledger_entries"."reversal_of" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "advance_ledger_entries_ack_pending_idx" ON "advance_ledger_entries" USING btree ("created_at") WHERE "advance_ledger_entries"."ack_status" = 'PENDING';--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_ack_status" CHECK ("advance_ledger_entries"."ack_status" IS NULL OR "advance_ledger_entries"."ack_status" IN ('PENDING', 'CONFIRMED', 'DISPUTED', 'AUTO'));