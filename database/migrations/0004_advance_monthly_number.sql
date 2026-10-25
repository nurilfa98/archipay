-- Nomor uang muka berubah dari "UM-0001" (urut selamanya) menjadi
-- "UM-2026-10-0001" (urutan mulai dari 0001 lagi setiap bulan).
-- File ini dibuat drizzle-kit lalu disunting manual agar data yang sudah ada
-- ikut dinomori ulang (kolom baru tidak bisa langsung NOT NULL).
-- Periode data lama dihitung dengan zona waktu Asia/Jakarta (default APP_TIMEZONE).
CREATE TABLE "document_sequences" (
	"prefix" varchar(10) NOT NULL,
	"period_year" smallint NOT NULL,
	"period_month" smallint NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "document_sequences_prefix_period_year_period_month_pk" PRIMARY KEY("prefix","period_year","period_month")
);
--> statement-breakpoint
ALTER TABLE "advance_requests" ALTER COLUMN "number" DROP IDENTITY;--> statement-breakpoint
ALTER TABLE "advance_requests" ALTER COLUMN "number" SET DATA TYPE varchar(20) USING "number"::varchar(20);--> statement-breakpoint
ALTER TABLE "advance_requests" ADD COLUMN "period_year" smallint;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD COLUMN "period_month" smallint;--> statement-breakpoint
UPDATE "advance_requests" SET
	"period_year" = extract(year from "created_at" at time zone 'Asia/Jakarta'),
	"period_month" = extract(month from "created_at" at time zone 'Asia/Jakarta');--> statement-breakpoint
WITH "numbered" AS (
	SELECT "id", row_number() OVER (PARTITION BY "period_year", "period_month" ORDER BY "created_at", "id") AS "seq"
	FROM "advance_requests"
)
UPDATE "advance_requests" AS a SET "number" =
	'UM-' || a."period_year" || '-' || lpad(a."period_month"::text, 2, '0') || '-' || lpad(n."seq"::text, 4, '0')
FROM "numbered" AS n
WHERE a."id" = n."id";--> statement-breakpoint
INSERT INTO "document_sequences" ("prefix", "period_year", "period_month", "last_value")
SELECT 'UM', "period_year", "period_month", count(*) FROM "advance_requests" GROUP BY "period_year", "period_month";--> statement-breakpoint
ALTER TABLE "advance_requests" ALTER COLUMN "period_year" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "advance_requests" ALTER COLUMN "period_month" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "advance_requests_period_idx" ON "advance_requests" USING btree ("period_year","period_month");
