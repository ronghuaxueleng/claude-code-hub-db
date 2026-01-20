"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  findAllHeartbeatUrlConfigs,
  findHeartbeatUrlConfigById,
  createHeartbeatUrlConfig,
  updateHeartbeatUrlConfig,
  deleteHeartbeatUrlConfig,
  type HeartbeatUrlConfig,
  type CreateHeartbeatUrlConfigInput,
  type UpdateHeartbeatUrlConfigInput,
} from "@/repository/heartbeat-url-configs";
import type { ActionResult } from "./types";

/**
 * 获取所有心跳URL配置
 */
export async function fetchHeartbeatUrlConfigs(): Promise<ActionResult<HeartbeatUrlConfig[]>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限访问心跳URL配置" };
    }

    const configs = await findAllHeartbeatUrlConfigs();
    return { ok: true, data: configs };
  } catch (error) {
    logger.error("获取心跳URL配置失败:", error);
    return { ok: false, error: "获取心跳URL配置失败" };
  }
}

/**
 * 创建心跳URL配置
 */
export async function createHeartbeatUrlConfigAction(
  input: CreateHeartbeatUrlConfigInput
): Promise<ActionResult<HeartbeatUrlConfig>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    // 验证输入
    if (!input.name || input.name.trim() === "") {
      return { ok: false, error: "配置名称不能为空" };
    }

    if (!input.url || input.url.trim() === "") {
      return { ok: false, error: "URL不能为空" };
    }

    // 验证URL格式
    try {
      new URL(input.url);
    } catch {
      return { ok: false, error: "URL格式不正确" };
    }

    // 验证间隔时间
    if (input.intervalSeconds !== undefined) {
      if (input.intervalSeconds < 10 || input.intervalSeconds > 3600) {
        return { ok: false, error: "心跳间隔必须在10-3600秒之间" };
      }
    }

    // 创建配置
    const config = await createHeartbeatUrlConfig(input);

    // 重启心跳任务
    try {
      const { ProviderHeartbeat } = await import("@/lib/provider-heartbeat");
      await ProviderHeartbeat.restart();
      logger.info("心跳任务已重启（创建配置后）", { configId: config.id });
    } catch (error) {
      logger.warn("重启心跳任务失败", { error });
    }

    revalidatePath("/settings/heartbeat");

    return { ok: true, data: config };
  } catch (error) {
    logger.error("创建心跳URL配置失败:", error);
    const message = error instanceof Error ? error.message : "创建心跳URL配置失败";
    return { ok: false, error: message };
  }
}

/**
 * 更新心跳URL配置
 */
export async function updateHeartbeatUrlConfigAction(
  id: number,
  input: UpdateHeartbeatUrlConfigInput
): Promise<ActionResult<HeartbeatUrlConfig>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    // 验证配置是否存在
    const existing = await findHeartbeatUrlConfigById(id);
    if (!existing) {
      return { ok: false, error: "配置不存在" };
    }

    // 验证输入
    if (input.name !== undefined && input.name.trim() === "") {
      return { ok: false, error: "配置名称不能为空" };
    }

    if (input.url !== undefined && input.url.trim() === "") {
      return { ok: false, error: "URL不能为空" };
    }

    // 验证URL格式
    if (input.url !== undefined) {
      try {
        new URL(input.url);
      } catch {
        return { ok: false, error: "URL格式不正确" };
      }
    }

    // 验证间隔时间
    if (input.intervalSeconds !== undefined) {
      if (input.intervalSeconds < 10 || input.intervalSeconds > 3600) {
        return { ok: false, error: "心跳间隔必须在10-3600秒之间" };
      }
    }

    // 更新配置
    const config = await updateHeartbeatUrlConfig(id, input);

    // 重启心跳任务
    try {
      const { ProviderHeartbeat } = await import("@/lib/provider-heartbeat");
      await ProviderHeartbeat.restart();
      logger.info("心跳任务已重启（更新配置后）", { configId: id });
    } catch (error) {
      logger.warn("重启心跳任务失败", { error });
    }

    revalidatePath("/settings/heartbeat");

    return { ok: true, data: config };
  } catch (error) {
    logger.error("更新心跳URL配置失败:", error);
    const message = error instanceof Error ? error.message : "更新心跳URL配置失败";
    return { ok: false, error: message };
  }
}

/**
 * 删除心跳URL配置
 */
export async function deleteHeartbeatUrlConfigAction(id: number): Promise<ActionResult<void>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    // 验证配置是否存在
    const existing = await findHeartbeatUrlConfigById(id);
    if (!existing) {
      return { ok: false, error: "配置不存在" };
    }

    // 删除配置
    await deleteHeartbeatUrlConfig(id);

    // 重启心跳任务
    try {
      const { ProviderHeartbeat } = await import("@/lib/provider-heartbeat");
      await ProviderHeartbeat.restart();
      logger.info("心跳任务已重启（删除配置后）", { configId: id });
    } catch (error) {
      logger.warn("重启心跳任务失败", { error });
    }

    revalidatePath("/settings/heartbeat");

    return { ok: true, data: undefined };
  } catch (error) {
    logger.error("删除心跳URL配置失败:", error);
    const message = error instanceof Error ? error.message : "删除心跳URL配置失败";
    return { ok: false, error: message };
  }
}
