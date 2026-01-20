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
  intervalSeconds: number;
  savedCurls: SavedCurl[];
  selectedCurlIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateHeartbeatSettingsInput {
  enabled?: boolean;
  intervalSeconds?: number;
  selectedCurlIndex?: number | null;
}

/**
 * 创建默认心跳配置
 */
function createDefaultSettings(): HeartbeatSettings {
  const now = new Date();
  return {
    id: 1,
    enabled: false,
    intervalSeconds: 30,
    savedCurls: [],
    selectedCurlIndex: null,
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
      // 表存在但没有数据，创建默认记录
      try {
        const [created] = await db
          .insert(heartbeatSettings)
          .values({
            enabled: false,
            intervalSeconds: 30,
            savedCurls: [],
            selectedCurlIndex: null,
          })
          .returning();

        logger.info("Heartbeat settings created with default values");
        return {
          ...created,
          savedCurls: (created.savedCurls as SavedCurl[]) || [],
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
      savedCurls: (row.savedCurls as SavedCurl[]) || [],
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    };
  } catch (error) {
    // 表不存在，返回默认配置
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
    // 先获取现有配置
    const existing = await getHeartbeatSettings();

    // 如果是默认配置（id=1且表不存在），先创建记录
    if (existing.id === 1) {
      try {
        const [created] = await db
          .insert(heartbeatSettings)
          .values({
            enabled: input.enabled ?? false,
            intervalSeconds: input.intervalSeconds ?? 30,
            savedCurls: [],
            selectedCurlIndex: input.selectedCurlIndex ?? null,
          })
          .returning();

        return {
          ...created,
          savedCurls: (created.savedCurls as SavedCurl[]) || [],
          createdAt: created.createdAt ?? new Date(),
          updatedAt: created.updatedAt ?? new Date(),
        };
      } catch (insertError) {
        // 如果插入失败（可能记录已存在），尝试更新
      }
    }

    // 更新现有记录
    const [updated] = await db
      .update(heartbeatSettings)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(heartbeatSettings.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update heartbeat settings");
    }

    logger.info("Heartbeat settings updated", { input });

    return {
      ...updated,
      savedCurls: (updated.savedCurls as SavedCurl[]) || [],
      createdAt: updated.createdAt ?? new Date(),
      updatedAt: updated.updatedAt ?? new Date(),
    };
  } catch (error) {
    logger.error("Failed to update heartbeat settings", { error, input });
    throw error;
  }
}

/**
 * 添加成功的 curl 命令到列表（最多保留20条）
 */
export async function addSuccessfulCurl(curl: SavedCurl): Promise<void> {
  try {
    const settings = await getHeartbeatSettings();

    // 添加新的 curl 到列表开头，最多保留20条
    const newCurls = [curl, ...settings.savedCurls].slice(0, 20);

    // 如果是默认配置，先创建记录
    if (settings.id === 1) {
      try {
        await db.insert(heartbeatSettings).values({
          enabled: settings.enabled,
          intervalSeconds: settings.intervalSeconds,
          savedCurls: newCurls,
          selectedCurlIndex: settings.selectedCurlIndex,
        });
        return;
      } catch (insertError) {
        // 记录已存在，继续更新
      }
    }

    // 更新列表
    await db
      .update(heartbeatSettings)
      .set({
        savedCurls: newCurls,
        updatedAt: new Date(),
      })
      .where(eq(heartbeatSettings.id, settings.id));

    logger.debug("Added successful curl to heartbeat settings", {
      providerId: curl.providerId,
      endpoint: curl.endpoint,
      totalCurls: newCurls.length,
    });
  } catch (error) {
    logger.warn("Failed to add successful curl", { error });
  }
}
