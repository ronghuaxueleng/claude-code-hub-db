ALTER TABLE "cf_optimized_domains" ADD COLUMN "auto_test_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cf_optimized_domains" ADD COLUMN "auto_test_interval" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "cf_optimized_domains" ADD COLUMN "last_auto_test_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cf_optimized_domains_auto_test" ON "cf_optimized_domains" USING btree ("auto_test_enabled");