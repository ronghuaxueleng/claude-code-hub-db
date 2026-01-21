ALTER TABLE "heartbeat_url_configs" ADD COLUMN "session_id" varchar(200);--> statement-breakpoint
ALTER TABLE "heartbeat_url_configs" ADD COLUMN "status" varchar(20) DEFAULT 'initial' NOT NULL;