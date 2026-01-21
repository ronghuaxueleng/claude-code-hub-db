ALTER TABLE "heartbeat_url_configs" ALTER COLUMN "url" SET DATA TYPE varchar(1024);--> statement-breakpoint
ALTER TABLE "heartbeat_url_configs" ALTER COLUMN "model" SET DATA TYPE varchar(128);--> statement-breakpoint
ALTER TABLE "heartbeat_url_configs" ALTER COLUMN "endpoint" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "circuit_breaker_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_heartbeat_url_configs_provider" ON "heartbeat_url_configs" USING btree ("provider_id");--> statement-breakpoint
ALTER TABLE "heartbeat_url_configs" DROP COLUMN "session_id";--> statement-breakpoint
ALTER TABLE "heartbeat_url_configs" DROP COLUMN "status";