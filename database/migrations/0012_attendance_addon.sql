ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_kind_check";--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "attendance_user_price" bigint DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "attendance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_attendance_price_check" CHECK ("platform_settings"."attendance_user_price" >= 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_kind_check" CHECK (("subscriptions"."kind" = 'PLAN' AND "subscriptions"."months" IN (1, 6, 12)) OR ("subscriptions"."kind" IN ('TOPUP', 'ADDON') AND "subscriptions"."months" IS NULL));--> statement-breakpoint
-- Absensi dulu termasuk harga dasar: paket yang sudah dibeli sebelum add-on ada tetap mendapat absensi sampai periodenya habis.
UPDATE "subscriptions" SET "attendance" = true WHERE "kind" = 'PLAN';
