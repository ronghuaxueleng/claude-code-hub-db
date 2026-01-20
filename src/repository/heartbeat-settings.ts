"use server";

import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { heartbeatSettings } from "@/drizzle/schema";
import { logger } from "@/lib/logger";

export interface HeartbeatSettings {
  id: number;
  enabled: boolean;
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
          })
          .returning();

        logger.info("Heartbeat settings created with default values");
        return {
          ...created,
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
    // 先尝试更新现有记录
    const [updated] = await db
      .update(heartbeatSettings)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(heartbeatSettings.id, 1))
      .returning();

    // 如果更新成功，返回结果
    if (updated) {
      logger.info("Heartbeat settings updated", { input });
      return {
        ...updated,
        createdAt: updated.createdAt ?? new Date(),
        updatedAt: updated.updatedAt ?? new Date(),
      };
    }

    // 如果没有记录被更新，说明记录不存在，创建新记录
    const [created] = await db
      .insert(heartbeatSettings)
      .values({
        enabled: input.enabled ?? false,
      })
      .returning();

    logger.info("Heartbeat settings created", { input });
    return {
      ...created,
      createdAt: created.createdAt ?? new Date(),
      updatedAt: created.updatedAt ?? new Date(),
    };
  } catch (error) {
    logger.error("Failed to update heartbeat settings", { error, input });
    throw error;
  }
}
