CREATE TABLE IF NOT EXISTS "heartbeat_url_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" varchar(1024) NOT NULL,
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
	"model" varchar(128),
	"endpoint" varchar(256),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_heartbeat_url_configs_enabled" ON "heartbeat_url_configs" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_heartbeat_url_configs_provider" ON "heartbeat_url_configs" USING btree ("provider_id");--> statement-breakpoint
-- 数据迁移：将当前选中的 curl 命令转换为第一个 URL 配置
DO $$
DECLARE
  settings_row RECORD;
  selected_curl JSONB;
  curl_command TEXT;
  parsed_method TEXT;
  parsed_url TEXT;
  parsed_headers JSONB := '{}'::JSONB;
  parsed_body TEXT;
BEGIN
  -- 获取现有的心跳设置
  SELECT * INTO settings_row FROM heartbeat_settings LIMIT 1;

  -- 如果存在选中的 curl 命令，则迁移到新表
  IF settings_row.selected_curl_index IS NOT NULL AND settings_row.saved_curls IS NOT NULL THEN
    -- 获取选中的 curl 命令对象
    selected_curl := settings_row.saved_curls->settings_row.selected_curl_index;

    IF selected_curl IS NOT NULL THEN
      curl_command := selected_curl->>'curl';

      -- 简单解析 curl 命令提取基本信息
      -- 提取 URL（假设格式为 curl ... "URL" 或 curl ... URL）
      parsed_url := selected_curl->>'url';
      parsed_method := 'POST'; -- 默认方法

      -- 如果 curl 命令中包含 -X GET，则设置为 GET
      IF curl_command LIKE '%-X GET%' OR curl_command LIKE '%-X ''GET''%' THEN
        parsed_method := 'GET';
      END IF;

      -- 插入新的 URL 配置
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
        COALESCE(selected_curl->>'providerName', 'Migrated from legacy'),
        parsed_url,
        parsed_method,
        parsed_headers,
        parsed_body,
        COALESCE(settings_row.interval_seconds, 30),
        settings_row.enabled,
        (selected_curl->>'providerId')::INTEGER,
        selected_curl->>'model',
        selected_curl->>'endpoint',
        now(),
        now()
      );
    END IF;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "heartbeat_settings" DROP COLUMN IF EXISTS "interval_seconds";--> statement-breakpoint
ALTER TABLE "heartbeat_settings" DROP COLUMN IF EXISTS "saved_curls";--> statement-breakpoint
ALTER TABLE "heartbeat_settings" DROP COLUMN IF EXISTS "selected_curl_index";