"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  type CreateHeartbeatUrlConfigInput,
  createHeartbeatUrlConfig,
  deleteHeartbeatUrlConfig,
  findAllHeartbeatUrlConfigs,
  findHeartbeatUrlConfigById,
  type HeartbeatUrlConfig,
  type UpdateHeartbeatUrlConfigInput,
  updateHeartbeatUrlConfig,
} from "@/repository/heartbeat-url-configs";
import type { ActionResult } from "./types";

/**
 * 获取所有心跳 URL 配置
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
 * 创建心跳 URL 配置
 */
export async function createHeartbeatUrlConfigAction(
  formData: CreateHeartbeatUrlConfigInput
): Promise<ActionResult<HeartbeatUrlConfig>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    if (!formData.name || formData.name.trim().length === 0) {
      return { ok: false, error: "配置名称不能为空" };
    }

    if (!formData.url || formData.url.trim().length === 0) {
      return { ok: false, error: "URL不能为空" };
    }

    try {
      new URL(formData.url);
    } catch {
      return { ok: false, error: "URL格式不正确" };
    }

    if (formData.intervalSeconds !== undefined) {
      if (formData.intervalSeconds < 10 || formData.intervalSeconds > 3600) {
        return { ok: false, error: "心跳间隔必须在10-3600秒之间" };
      }
    }

    const created = await createHeartbeatUrlConfig(formData);

    if (created.isEnabled) {
      try {
        const { ProviderHeartbeat } = await import("@/lib/provider-heartbeat");
        await ProviderHeartbeat.restart();
        logger.info("心跳URL配置创建成功，已重启心跳任务", {
          id: created.id,
          name: created.name,
        });
      } catch (error) {
        logger.warn("重启心跳任务失败", { error });
      }
    }

    revalidatePath("/settings/heartbeat");

    return { ok: true, data: created };
  } catch (error) {
    logger.error("创建心跳URL配置失败:", error);
    const message = error instanceof Error ? error.message : "创建心跳URL配置失败";
    return { ok: false, error: message };
  }
}

/**
 * 更新心跳 URL 配置
 */
export async function updateHeartbeatUrlConfigAction(
  id: number,
  formData: UpdateHeartbeatUrlConfigInput
): Promise<ActionResult<HeartbeatUrlConfig>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    if (formData.name !== undefined && formData.name.trim().length === 0) {
      return { ok: false, error: "配置名称不能为空" };
    }

    if (formData.url !== undefined) {
      if (formData.url.trim().length === 0) {
        return { ok: false, error: "URL不能为空" };
      }
      try {
        new URL(formData.url);
      } catch {
        return { ok: false, error: "URL格式不正确" };
      }
    }

    if (formData.intervalSeconds !== undefined) {
      if (formData.intervalSeconds < 10 || formData.intervalSeconds > 3600) {
        return { ok: false, error: "心跳间隔必须在10-3600秒之间" };
      }
    }

    const updated = await updateHeartbeatUrlConfig(id, formData);

    if (!updated) {
      return { ok: false, error: "配置不存在" };
    }

    try {
      const { ProviderHeartbeat } = await import("@/lib/provider-heartbeat");
      await ProviderHeartbeat.restart();
      logger.info("心跳URL配置更新成功，已重启心跳任务", {
        id,
        changes: formData,
      });
    } catch (error) {
      logger.warn("重启心跳任务失败", { error });
    }

    revalidatePath("/settings/heartbeat");

    return { ok: true, data: updated };
  } catch (error) {
    logger.error("更新心跳URL配置失败:", error);
    const message = error instanceof Error ? error.message : "更新心跳URL配置失败";
    return { ok: false, error: message };
  }
}

/**
 * 删除心跳 URL 配置
 */
export async function deleteHeartbeatUrlConfigAction(id: number): Promise<ActionResult<boolean>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const config = await findHeartbeatUrlConfigById(id);
    if (!config) {
      return { ok: false, error: "配置不存在" };
    }

    const deleted = await deleteHeartbeatUrlConfig(id);

    if (!deleted) {
      return { ok: false, error: "删除配置失败" };
    }

    try {
      const { ProviderHeartbeat } = await import("@/lib/provider-heartbeat");
      await ProviderHeartbeat.restart();
      logger.info("心跳URL配置删除成功，已重启心跳任务", {
        id,
        name: config.name,
      });
    } catch (error) {
      logger.warn("重启心跳任务失败", { error });
    }

    revalidatePath("/settings/heartbeat");

    return { ok: true, data: true };
  } catch (error) {
    logger.error("删除心跳URL配置失败:", error);
    const message = error instanceof Error ? error.message : "删除心跳URL配置失败";
    return { ok: false, error: message };
  }
}
