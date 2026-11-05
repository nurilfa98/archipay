ALTER TABLE "platform_settings" DROP CONSTRAINT "platform_settings_selfie_retention_check";--> statement-breakpoint
ALTER TABLE "attendance_records" DROP COLUMN "check_in_selfie_key";--> statement-breakpoint
ALTER TABLE "attendance_records" DROP COLUMN "check_out_selfie_key";--> statement-breakpoint
ALTER TABLE "attendance_records" DROP COLUMN "selfie_deleted_at";--> statement-breakpoint
ALTER TABLE "platform_settings" DROP COLUMN "attendance_selfie_retention_months";