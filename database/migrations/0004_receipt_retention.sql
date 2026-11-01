ALTER TABLE "platform_settings" ADD COLUMN "receipt_retention_months" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD COLUMN "file_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_receipt_retention_check" CHECK ("platform_settings"."receipt_retention_months" BETWEEN 1 AND 120);