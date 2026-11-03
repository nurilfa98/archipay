CREATE TABLE "attendance_penalties" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"record_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"period" varchar(7) NOT NULL,
	"amount" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_penalties_amount" CHECK ("attendance_penalties"."amount" > 0),
	CONSTRAINT "attendance_penalties_status" CHECK ("attendance_penalties"."status" IN ('ACTIVE', 'WAIVED'))
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"work_date" date NOT NULL,
	"timezone" varchar(40) NOT NULL,
	"is_work_day" boolean NOT NULL,
	"schedule_start_minute" integer NOT NULL,
	"schedule_end_minute" integer NOT NULL,
	"tolerance_minutes" integer NOT NULL,
	"check_in_location_id" varchar(36) NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_in_latitude" double precision NOT NULL,
	"check_in_longitude" double precision NOT NULL,
	"check_in_accuracy" integer NOT NULL,
	"check_in_distance" integer NOT NULL,
	"check_in_in_radius" boolean NOT NULL,
	"check_in_selfie_key" varchar(255),
	"check_in_face_score" integer NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"late_reason" varchar(500),
	"check_in_outside_reason" varchar(500),
	"check_out_location_id" varchar(36),
	"check_out_at" timestamp with time zone,
	"check_out_latitude" double precision,
	"check_out_longitude" double precision,
	"check_out_accuracy" integer,
	"check_out_distance" integer,
	"check_out_in_radius" boolean,
	"check_out_selfie_key" varchar(255),
	"check_out_face_score" integer,
	"early_minutes" integer,
	"early_reason" varchar(500),
	"check_out_outside_reason" varchar(500),
	"appeal_note" varchar(1000),
	"selfie_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_late" CHECK ("attendance_records"."late_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "attendance_selfie_retention_months" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "face_match_threshold" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD CONSTRAINT "attendance_penalties_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD CONSTRAINT "attendance_penalties_record_id_attendance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."attendance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_penalties" ADD CONSTRAINT "attendance_penalties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_check_in_location_id_attendance_locations_id_fk" FOREIGN KEY ("check_in_location_id") REFERENCES "public"."attendance_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_check_out_location_id_attendance_locations_id_fk" FOREIGN KEY ("check_out_location_id") REFERENCES "public"."attendance_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_penalties_record_unique" ON "attendance_penalties" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "attendance_penalties_company_period_idx" ON "attendance_penalties" USING btree ("company_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_user_date_unique" ON "attendance_records" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_records_company_date_idx" ON "attendance_records" USING btree ("company_id","work_date");--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_selfie_retention_check" CHECK ("platform_settings"."attendance_selfie_retention_months" BETWEEN 1 AND 24);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_face_threshold_check" CHECK ("platform_settings"."face_match_threshold" BETWEEN 30 AND 95);