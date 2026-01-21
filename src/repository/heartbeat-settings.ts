"use server";

import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { heartbeatSettings } from "@/drizzle/schema";
import { logger } from "@/lib/logger";

export interface SavedCurl {
  curl: string;
  providerId: number;
  providerName: string;
  url: string;
  endpoint: string;
  model: string | null;
  timestamp: number;
}

export interface HeartbeatSettings {
  id: number;
  enabled: boolean;
  savedCurls: SavedCurl[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateHeartbeatSettingsInput {
  enabled?: boolean;
}

/**
 * 创建默认心跳配置
 */
function createDefaultSettings(): HeartbeatSettings {
  const now = new Date();
  return {
    id: 1,
    enabled: false,
    savedCurls: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 获取心跳配置，如果不存在则返回默认配置
 */
export async function getHeartbeatSettings(): Promise<HeartbeatSettings> {
  try {
    const [row] = await db.select().from(heartbeatSettings).limit(1);

    if (!row) {
      try {
        const [created] = await db
          .insert(heartbeatSettings)
          .values({
            enabled: false,
          })
          .returning();

        logger.info("Heartbeat settings created with default values");
        return {
          ...created,
          savedCurls: [],
          createdAt: created.createdAt ?? new Date(),
          updatedAt: created.updatedAt ?? new Date(),
        };
      } catch (insertError) {
        logger.warn("Failed to create default heartbeat settings", { error: insertError });
        return createDefaultSettings();
      }
    }

    return {
      ...row,
      savedCurls: [],
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    };
  } catch (error) {
    logger.warn("Failed to get heartbeat settings, using defaults", { error });
    return createDefaultSettings();
  }
}

/**
 * 更新心跳配置
 */
export async function updateHeartbeatSettings(
  input: UpdateHeartbeatSettingsInput
): Promise<HeartbeatSettings> {
  try {
    // 先获取当前记录
    const [current] = await db.select().from(heartbeatSettings).limit(1);

    if (current) {
      // 更新现有记录
      const [updated] = await db
        .update(heartbeatSettings)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(heartbeatSettings.id, current.id))
        .returning();

      logger.info("Heartbeat settings updated", { input, id: current.id });
      return {
        ...updated,
        savedCurls: [],
        createdAt: updated.createdAt ?? new Date(),
        updatedAt: updated.updatedAt ?? new Date(),
      };
    }

    // 如果没有记录，创建新记录（指定 id=1）
    const [created] = await db
      .insert(heartbeatSettings)
      .values({
        id: 1,
        enabled: input.enabled ?? false,
      })
      .returning();

    logger.info("Heartbeat settings created", { input });
    return {
      ...created,
      savedCurls: [],
      createdAt: created.createdAt ?? new Date(),
      updatedAt: created.updatedAt ?? new Date(),
    };
  } catch (error) {
    logger.error("Failed to update heartbeat settings", { error, input });
    throw error;
  }
}

/**
 * 添加成功的 curl 命令到列表（最多保留20条）
 * 注意：此函数保留用于向后兼容，但不再存储 curl 命令
 */
export async function addSuccessfulCurl(curl: SavedCurl): Promise<void> {
  logger.debug("addSuccessfulCurl called but no longer storing curls", {
    providerId: curl.providerId,
    endpoint: curl.endpoint,
  });
}
