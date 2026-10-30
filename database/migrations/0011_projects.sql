CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"client" varchar(120),
	"icon" varchar(30) DEFAULT 'building' NOT NULL,
	"contract_value" bigint,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_by_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name"),
	CONSTRAINT "projects_status" CHECK ("projects"."status" in ('ACTIVE', 'COMPLETED')),
	CONSTRAINT "projects_contract_value_positive" CHECK ("projects"."contract_value" is null or "projects"."contract_value" > 0)
);
--> statement-breakpoint
ALTER TABLE "advance_requests" ADD COLUMN "project_id" varchar(36);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_requests_project_idx" ON "advance_requests" USING btree ("project_id","created_at");