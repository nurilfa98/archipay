CREATE TABLE "return_claims" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"settlement_id" varchar(36) NOT NULL,
	"advance_id" varchar(36) NOT NULL,
	"reporter_id" varchar(36) NOT NULL,
	"amount" bigint NOT NULL,
	"method" varchar(20) NOT NULL,
	"returned_on" date NOT NULL,
	"note" varchar(300),
	"proof_key" varchar(255),
	"proof_content_type" varchar(50),
	"proof_deleted_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_id" varchar(36),
	"reject_reason" varchar(500),
	"received_on" date,
	"ledger_entry_id" varchar(36),
	CONSTRAINT "return_claims_status_check" CHECK ("return_claims"."status" IN ('PENDING', 'CONFIRMED', 'REJECTED')),
	CONSTRAINT "return_claims_method_check" CHECK ("return_claims"."method" IN ('CASH', 'TRANSFER')),
	CONSTRAINT "return_claims_amount_check" CHECK ("return_claims"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "received_on" date;--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "proof_key" varchar(255);--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "proof_content_type" varchar(50);--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD COLUMN "proof_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_advance_id_advance_requests_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_claims" ADD CONSTRAINT "return_claims_ledger_entry_id_advance_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."advance_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "return_claims_one_pending" ON "return_claims" USING btree ("settlement_id") WHERE "return_claims"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "return_claims_company_status_idx" ON "return_claims" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "return_claims_settlement_idx" ON "return_claims" USING btree ("settlement_id","created_at");