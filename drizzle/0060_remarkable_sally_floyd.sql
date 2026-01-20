CREATE TABLE IF NOT EXISTS "heartbeat_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_seconds" integer DEFAULT 30 NOT NULL,
	"saved_curls" jsonb DEFAULT '[]'::jsonb,
	"selected_curl_index" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
