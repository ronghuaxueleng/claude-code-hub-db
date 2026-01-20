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
 * 获取所有心跳URL配置
 */
export async function findAllHeartbeatUrlConfigs(): Promise<HeartbeatUrlConfig[]> {
  try {
    const rows = await db.select().from(heartbeatUrlConfigs).orderBy(heartbeatUrlConfigs.id);

    return rows.map((row) => ({
      ...row,
      headers: (row.headers as Record<string, string>) || {},
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  } catch (error) {
    logger.error("获取心跳URL配置失败", { error });
    return [];
  }
}

/**
 * 获取所有启用的心跳URL配置
 */
export async function findEnabledHeartbeatUrlConfigs(): Promise<HeartbeatUrlConfig[]> {
  try {
    const rows = await db
      .select()
      .from(heartbeatUrlConfigs)
      .where(eq(heartbeatUrlConfigs.isEnabled, true))
      .orderBy(heartbeatUrlConfigs.id);

    return rows.map((row) => ({
      ...row,
      headers: (row.headers as Record<string, string>) || {},
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  } catch (error) {
    logger.error("获取启用的心跳URL配置失败", { error });
    return [];
  }
}

/**
 * 根据ID获取心跳URL配置
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
    logger.error("获取心跳URL配置失败", { error, id });
    return null;
  }
}

/**
 * 创建心跳URL配置
 */
export async function createHeartbeatUrlConfig(
  input: CreateHeartbeatUrlConfigInput
): Promise<HeartbeatUrlConfig> {
  const [row] = await db
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

  logger.info("创建心跳URL配置成功", { id: row.id, name: input.name });

  return {
    ...row,
    headers: (row.headers as Record<string, string>) || {},
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/**
 * 更新心跳URL配置
 */
export async function updateHeartbeatUrlConfig(
  id: number,
  input: UpdateHeartbeatUrlConfigInput
): Promise<HeartbeatUrlConfig> {
  const [row] = await db
    .update(heartbeatUrlConfigs)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(heartbeatUrlConfigs.id, id))
    .returning();

  if (!row) {
    throw new Error(`心跳URL配置不存在: ${id}`);
  }

  logger.info("更新心跳URL配置成功", { id, changes: Object.keys(input) });

  return {
    ...row,
    headers: (row.headers as Record<string, string>) || {},
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/**
 * 删除心跳URL配置
 */
export async function deleteHeartbeatUrlConfig(id: number): Promise<void> {
  await db.delete(heartbeatUrlConfigs).where(eq(heartbeatUrlConfigs.id, id));

  logger.info("删除心跳URL配置成功", { id });
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
        updatedAt: new Date(),
      })
      .where(eq(heartbeatUrlConfigs.id, id));
  } catch (error) {
    logger.error("记录心跳成功失败", { error, id });
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
        lastErrorMessage: errorMessage,
        failureCount: sql`${heartbeatUrlConfigs.failureCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(heartbeatUrlConfigs.id, id));
  } catch (error) {
    logger.error("记录心跳失败失败", { error, id });
  }
}
