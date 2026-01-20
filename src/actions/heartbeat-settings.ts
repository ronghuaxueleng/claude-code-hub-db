"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getHeartbeatSettings,
  updateHeartbeatSettings,
  type HeartbeatSettings,
  type UpdateHeartbeatSettingsInput,
} from "@/repository/heartbeat-settings";
import type { ActionResult } from "./types";

/**
 * 获取心跳配置
 */
export async function fetchHeartbeatSettings(): Promise<ActionResult<HeartbeatSettings>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限访问心跳设置" };
    }

    const settings = await getHeartbeatSettings();
    return { ok: true, data: settings };
  } catch (error) {
    logger.error("获取心跳设置失败:", error);
    return { ok: false, error: "获取心跳设置失败" };
  }
}

/**
 * 更新心跳配置
 */
export async function saveHeartbeatSettings(
  formData: UpdateHeartbeatSettingsInput
): Promise<ActionResult<HeartbeatSettings>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const updated = await updateHeartbeatSettings(formData);

    // 如果启用/禁用心跳，重启心跳任务
    if (formData.enabled !== undefined) {
      try {
        const { ProviderHeartbeat } = await import("@/lib/provider-heartbeat");
        await ProviderHeartbeat.restart();
        logger.info("心跳任务已重启", {
          enabled: updated.enabled,
        });
      } catch (error) {
        logger.warn("重启心跳任务失败", { error });
      }
    }

    revalidatePath("/settings/heartbeat");

    return { ok: true, data: updated };
  } catch (error) {
    logger.error("更新心跳设置失败:", error);
    const message = error instanceof Error ? error.message : "更新心跳设置失败";
    return { ok: false, error: message };
  }
}
