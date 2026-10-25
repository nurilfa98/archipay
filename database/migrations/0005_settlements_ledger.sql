CREATE TABLE "advance_ledger_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"advance_id" varchar(36) NOT NULL,
	"type" varchar(30) NOT NULL,
	"amount" bigint NOT NULL,
	"settlement_item_id" varchar(36),
	"note" varchar(300),
	"created_by_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advance_ledger_entries_amount_nonzero" CHECK ("advance_ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settlement_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
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
	"advance_id" varchar(36) NOT NULL,
	"number" varchar(20),
	"period_year" smallint,
	"period_month" smallint,
	"submitted_at" timestamp with time zone,
	"revision_note" varchar(500),
	"revision_requested_by_id" varchar(36),
	"revision_requested_at" timestamp with time zone,
	"verified_by_id" varchar(36),
	"verified_at" timestamp with time zone,
	"approved_amount" bigint,
	"balance_amount" bigint,
	"return_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_advance_id_unique" UNIQUE("advance_id"),
	CONSTRAINT "settlements_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_advance_id_advance_requests_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_settlement_item_id_settlement_items_id_fk" FOREIGN KEY ("settlement_item_id") REFERENCES "public"."settlement_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_ledger_entries" ADD CONSTRAINT "advance_ledger_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_advance_id_advance_requests_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advance_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_revision_requested_by_id_users_id_fk" FOREIGN KEY ("revision_requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_ledger_entries_advance_idx" ON "advance_ledger_entries" USING btree ("advance_id","created_at");--> statement-breakpoint
CREATE INDEX "settlement_items_settlement_idx" ON "settlement_items" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_items_file_hash_unique" ON "settlement_items" USING btree ("file_hash") WHERE "settlement_items"."file_hash" is not null;--> statement-breakpoint
CREATE INDEX "settlements_period_idx" ON "settlements" USING btree ("period_year","period_month");--> statement-breakpoint
-- Ditambahkan manual: kategori biaya awal (bisa diubah OWNER lewat UI nanti).
INSERT INTO "expense_categories" ("id", "name", "sort_order") VALUES
	(gen_random_uuid()::varchar, 'Transportasi', 1),
	(gen_random_uuid()::varchar, 'Konsumsi', 2),
	(gen_random_uuid()::varchar, 'ATK & Fotokopi', 3),
	(gen_random_uuid()::varchar, 'Parkir & Tol', 4),
	(gen_random_uuid()::varchar, 'Materai & Perizinan', 5),
	(gen_random_uuid()::varchar, 'Lain-lain', 6)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- Ditambahkan manual: uang muka yang SUDAH dikonfirmasi karyawan sebelum
-- ledger ada, diberi baris DISBURSEMENT agar saldonya benar.
INSERT INTO "advance_ledger_entries" ("id", "advance_id", "type", "amount", "note", "created_by_id", "created_at")
SELECT gen_random_uuid()::varchar, "id", 'DISBURSEMENT', "amount", 'Dana diterima karyawan', "recipient_id", coalesce("acknowledged_at", now())
FROM "advance_requests"
WHERE "status" = 'ACKNOWLEDGED';
