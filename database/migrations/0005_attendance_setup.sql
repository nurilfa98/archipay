CREATE TABLE "attendance_consents" (
	"user_id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"statement" text NOT NULL,
	"ip_address" varchar(45),
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_holidays" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"date" date NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_locations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"project_id" varchar(36),
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radius_meters" integer NOT NULL,
	"timezone" varchar(40) DEFAULT 'Asia/Jakarta' NOT NULL,
	"work_start_minute" integer,
	"work_end_minute" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_locations_latitude" CHECK ("attendance_locations"."latitude" between -90 and 90),
	CONSTRAINT "attendance_locations_longitude" CHECK ("attendance_locations"."longitude" between -180 and 180),
	CONSTRAINT "attendance_locations_radius" CHECK ("attendance_locations"."radius_meters" between 10 and 5000),
	CONSTRAINT "attendance_locations_timezone" CHECK ("attendance_locations"."timezone" in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
	CONSTRAINT "attendance_locations_work_hours" CHECK (("attendance_locations"."work_start_minute" is null and "attendance_locations"."work_end_minute" is null) or ("attendance_locations"."work_start_minute" between 0 and 1439 and "attendance_locations"."work_end_minute" between 1 and 1439 and "attendance_locations"."work_start_minute" < "attendance_locations"."work_end_minute"))
);
--> statement-breakpoint
CREATE TABLE "face_profiles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"photo_key" varchar(255),
	"embedding" real[] NOT NULL,
	"model_version" varchar(40) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"reject_reason" varchar(300),
	"reviewed_by_id" varchar(36),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "face_profiles_status_check" CHECK ("face_profiles"."status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "work_start_minute" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "work_end_minute" integer DEFAULT 1020 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "late_tolerance_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "late_penalty_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "work_days" smallint DEFAULT 63 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_consents" ADD CONSTRAINT "attendance_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_consents" ADD CONSTRAINT "attendance_consents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_holidays" ADD CONSTRAINT "attendance_holidays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_locations" ADD CONSTRAINT "attendance_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_locations" ADD CONSTRAINT "attendance_locations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_locations" ADD CONSTRAINT "attendance_locations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_holidays_company_date_unique" ON "attendance_holidays" USING btree ("company_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_locations_company_name_unique" ON "attendance_locations" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "face_profiles_company_status_idx" ON "face_profiles" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "face_profiles_one_pending" ON "face_profiles" USING btree ("user_id") WHERE "face_profiles"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "face_profiles_one_approved" ON "face_profiles" USING btree ("user_id") WHERE "face_profiles"."status" = 'APPROVED';--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_work_hours" CHECK ("company_settings"."work_start_minute" between 0 and 1439 and "company_settings"."work_end_minute" between 1 and 1439 and "company_settings"."work_start_minute" < "company_settings"."work_end_minute");--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_late_tolerance" CHECK ("company_settings"."late_tolerance_minutes" between 0 and 180);--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_late_penalty" CHECK ("company_settings"."late_penalty_amount" >= 0);--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_work_days" CHECK ("company_settings"."work_days" between 1 and 127);--> statement-breakpoint
-- Ditambahkan manual: role Admin HR (BUSINESS-FLOW §18.1). Tabel roles diisi
-- scripts/create-superadmin.mjs, yang tidak dijalankan ulang di database lama.
INSERT INTO "roles" ("id", "name", "description") VALUES (gen_random_uuid()::text, 'HR_ADMIN', 'Admin HR: lokasi absensi & foto acuan wajah') ON CONFLICT ("name") DO NOTHING;
