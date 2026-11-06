CREATE TABLE "error_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"digest" varchar(100),
	"fingerprint" varchar(40) NOT NULL,
	"source" varchar(20) NOT NULL,
	"error_name" varchar(100),
	"message" varchar(1000) NOT NULL,
	"stack" text,
	"action_name" varchar(150),
	"path" varchar(500),
	"method" varchar(10),
	"app_version" varchar(40),
	"company_id" varchar(36),
	"user_id" varchar(36),
	"role" varchar(100),
	"user_agent" varchar(200),
	"context" jsonb,
	"status" varchar(10) DEFAULT 'NEW' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" varchar(36),
	"note" varchar(500),
	CONSTRAINT "error_logs_status" CHECK ("error_logs"."status" IN ('NEW', 'RESOLVED', 'IGNORED')),
	CONSTRAINT "error_logs_source" CHECK ("error_logs"."source" IN ('SERVER_ACTION', 'PAGE', 'ROUTE', 'CRON', 'CLIENT', 'EXTERNAL'))
);
--> statement-breakpoint
CREATE INDEX "error_logs_created_at_idx" ON "error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_logs_fingerprint_idx" ON "error_logs" USING btree ("fingerprint","created_at");--> statement-breakpoint
CREATE INDEX "error_logs_digest_idx" ON "error_logs" USING btree ("digest");