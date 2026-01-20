"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { heartbeatUrlConfigs } from "@/drizzle/schema";
import { logger } from "@/lib/logger";

export interface HeartbeatUrlConfig {
  id: number;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  intervalSeconds: number;
  isEnabled: boolean;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  successCount: number;
  failureCount: number;
  providerId: number | null;
  model: string | null;
  endpoint: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHeartbeatUrlConfigInput {
  name: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  intervalSeconds?: number;
  isEnabled?: boolean;
  providerId?: number | null;
  model?: string | null;
  endpoint?: string | null;
}

export interface UpdateHeartbeatUrlConfigInput {
  name?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  intervalSeconds?: number;
  isEnabled?: boolean;
  providerId?: number | null;
  model?: string | null;
  endpoint?: string | null;
}

/**
 * 获取所有心跳 URL 配置
 */
export async function findAllHeartbeatUrlConfigs(): Promise<HeartbeatUrlConfig[]> {
  try {
    const rows = await db.select().from(heartbeatUrlConfigs).orderBy(heartbeatUrlConfigs.createdAt);

    return rows.map((row) => ({
      ...row,
      headers: (row.headers as Record<string, string>) || {},
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  } catch (error) {
    logger.error("Failed to find all heartbeat URL configs", { error });
    return [];
  }
}

/**
 * 获取所有启用的心跳 URL 配置
 */
export async function findEnabledHeartbeatUrlConfigs(): Promise<HeartbeatUrlConfig[]> {
  try {
    const rows = await db
      .select()
      .from(heartbeatUrlConfigs)
      .where(eq(heartbeatUrlConfigs.isEnabled, true))
      .orderBy(heartbeatUrlConfigs.createdAt);

    return rows.map((row) => ({
      ...row,
      headers: (row.headers as Record<string, string>) || {},
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  } catch (error) {
    logger.error("Failed to find enabled heartbeat URL configs", { error });
    return [];
  }
}

/**
 * 根据 ID 获取心跳 URL 配置
 */
export async function findHeartbeatUrlConfigById(id: number): Promise<HeartbeatUrlConfig | null> {
  try {
    const [row] = await db
      .select()
      .from(heartbeatUrlConfigs)
      .where(eq(heartbeatUrlConfigs.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      ...row,
      headers: (row.headers as Record<string, string>) || {},
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    };
  } catch (error) {
    logger.error("Failed to find heartbeat URL config by ID", { error, id });
    return null;
  }
}

/**
 * 创建心跳 URL 配置
 */
export async function createHeartbeatUrlConfig(
  input: CreateHeartbeatUrlConfigInput
): Promise<HeartbeatUrlConfig> {
  try {
    const [created] = await db
      .insert(heartbeatUrlConfigs)
      .values({
        name: input.name,
        url: input.url,
        method: input.method ?? "POST",
        headers: input.headers ?? {},
        body: input.body ?? null,
        intervalSeconds: input.intervalSeconds ?? 30,
        isEnabled: input.isEnabled ?? true,
        providerId: input.providerId ?? null,
        model: input.model ?? null,
        endpoint: input.endpoint ?? null,
      })
      .returning();

    logger.info("Heartbeat URL config created", { id: created.id, name: created.name });

    return {
      ...created,
      headers: (created.headers as Record<string, string>) || {},
      createdAt: created.createdAt ?? new Date(),
      updatedAt: created.updatedAt ?? new Date(),
    };
  } catch (error) {
    logger.error("Failed to create heartbeat URL config", { error, input });
    throw error;
  }
}

/**
 * 更新心跳 URL 配置
 */
export async function updateHeartbeatUrlConfig(
  id: number,
  input: UpdateHeartbeatUrlConfigInput
): Promise<HeartbeatUrlConfig | null> {
  try {
    const [updated] = await db
      .update(heartbeatUrlConfigs)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(heartbeatUrlConfigs.id, id))
      .returning();

    if (!updated) {
      return null;
    }

    logger.info("Heartbeat URL config updated", { id, input });

    return {
      ...updated,
      headers: (updated.headers as Record<string, string>) || {},
      createdAt: updated.createdAt ?? new Date(),
      updatedAt: updated.updatedAt ?? new Date(),
    };
  } catch (error) {
    logger.error("Failed to update heartbeat URL config", { error, id, input });
    throw error;
  }
}

/**
 * 删除心跳 URL 配置
 */
export async function deleteHeartbeatUrlConfig(id: number): Promise<boolean> {
  try {
    const result = await db
      .delete(heartbeatUrlConfigs)
      .where(eq(heartbeatUrlConfigs.id, id))
      .returning();

    if (result.length === 0) {
      return false;
    }

    logger.info("Heartbeat URL config deleted", { id });
    return true;
  } catch (error) {
    logger.error("Failed to delete heartbeat URL config", { error, id });
    throw error;
  }
}

/**
 * 记录心跳成功
 */
export async function recordHeartbeatSuccess(id: number): Promise<void> {
  try {
    await db
      .update(heartbeatUrlConfigs)
      .set({
        lastSuccessAt: new Date(),
        successCount: sql`${heartbeatUrlConfigs.successCount} + 1`,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(heartbeatUrlConfigs.id, id));

    logger.debug("Heartbeat success recorded", { id });
  } catch (error) {
    logger.warn("Failed to record heartbeat success", { error, id });
  }
}

/**
 * 记录心跳失败
 */
export async function recordHeartbeatFailure(id: number, errorMessage: string): Promise<void> {
  try {
    await db
      .update(heartbeatUrlConfigs)
      .set({
        lastErrorAt: new Date(),
        lastErrorMessage: errorMessage.slice(0, 500),
        failureCount: sql`${heartbeatUrlConfigs.failureCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(heartbeatUrlConfigs.id, id));

    logger.debug("Heartbeat failure recorded", { id, errorMessage });
  } catch (error) {
    logger.warn("Failed to record heartbeat failure", { error, id });
  }
}
