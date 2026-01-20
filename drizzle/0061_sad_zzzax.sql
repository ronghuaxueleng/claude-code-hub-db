CREATE TABLE IF NOT EXISTS "heartbeat_url_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"method" varchar(10) DEFAULT 'POST' NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb,
	"body" text,
	"interval_seconds" integer DEFAULT 30 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_message" text,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"provider_id" integer,
	"model" varchar(200),
	"endpoint" varchar(200),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_heartbeat_url_configs_enabled" ON "heartbeat_url_configs" USING btree ("is_enabled");--> statement-breakpoint
-- 数据迁移：将选中的curl转换为第一个URL配置
DO $$
DECLARE
  settings_row RECORD;
  selected_curl JSONB;
BEGIN
  -- 获取心跳设置
  SELECT * INTO settings_row FROM heartbeat_settings LIMIT 1;

  -- 如果存在选中的curl，迁移到新表
  IF settings_row.selected_curl_index IS NOT NULL AND settings_row.saved_curls IS NOT NULL THEN
    -- 获取选中的curl
    selected_curl := settings_row.saved_curls->settings_row.selected_curl_index;

    -- 如果选中的curl存在，创建URL配置
    IF selected_curl IS NOT NULL THEN
      INSERT INTO heartbeat_url_configs (
        name,
        url,
        method,
        headers,
        body,
        interval_seconds,
        is_enabled,
        provider_id,
        model,
        endpoint,
        created_at,
        updated_at
      ) VALUES (
        COALESCE(selected_curl->>'providerName', '默认心跳配置'),
        selected_curl->>'url',
        'POST',
        ''::jsonb,
        NULL,
        settings_row.interval_seconds,
        settings_row.enabled,
        (selected_curl->>'providerId')::integer,
        selected_curl->>'model',
        selected_curl->>'endpoint',
        now(),
        now()
      );

      RAISE NOTICE '已迁移选中的curl到URL配置表';
    END IF;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "heartbeat_settings" DROP COLUMN IF EXISTS "interval_seconds";--> statement-breakpoint
ALTER TABLE "heartbeat_settings" DROP COLUMN IF EXISTS "saved_curls";--> statement-breakpoint
ALTER TABLE "heartbeat_settings" DROP COLUMN IF EXISTS "selected_curl_index";