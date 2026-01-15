CREATE TABLE IF NOT EXISTS "cf_optimized_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" varchar(255) NOT NULL,
	"optimized_ips" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_cf_optimized_domains_domain" ON "cf_optimized_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cf_optimized_domains_enabled" ON "cf_optimized_domains" USING btree ("is_enabled");