CREATE TABLE IF NOT EXISTS "cf_ip_blacklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" varchar(255) NOT NULL,
	"ip" varchar(45) NOT NULL,
	"failure_count" integer DEFAULT 1 NOT NULL,
	"last_error_type" varchar(100),
	"last_error_message" text,
	"last_failure_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cf_ip_blacklist_domain_ip" ON "cf_ip_blacklist" USING btree ("domain","ip");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cf_ip_blacklist_domain" ON "cf_ip_blacklist" USING btree ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cf_ip_blacklist_failure_count" ON "cf_ip_blacklist" USING btree ("failure_count");