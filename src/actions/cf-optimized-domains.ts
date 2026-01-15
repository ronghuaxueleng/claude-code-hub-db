"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { refreshCache as refreshCfOptimizedCache } from "@/lib/cf-optimized-ip-resolver";
import * as repo from "@/repository/cf-optimized-domains";
import type { ActionResult } from "./types";

/**
 * 获取所有 CF 优选域名列表
 */
export async function listCfOptimizedDomains(): Promise<repo.CfOptimizedDomain[]> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      logger.warn("[CfOptimizedDomainsAction] Unauthorized access attempt");
      return [];
    }

    return await repo.getAllCfOptimizedDomains();
  } catch (error) {
    logger.error("[CfOptimizedDomainsAction] Failed to list domains:", error);
    return [];
  }
}

/**
 * 创建 CF 优选域名
 */
export async function createCfOptimizedDomainAction(data: {
  domain: string;
  optimizedIps: string[];
  description?: string;
  autoTestEnabled?: boolean;
  autoTestInterval?: number;
}): Promise<ActionResult<repo.CfOptimizedDomain>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return {
        ok: false,
        error: "权限不足",
      };
    }

    // 验证必填字段
    if (!data.domain || data.domain.trim().length === 0) {
      return {
        ok: false,
        error: "域名不能为空",
      };
    }

    // 验证 IP 格式（如果提供了 IP 列表）
    if (data.optimizedIps && data.optimizedIps.length > 0) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      for (const ip of data.optimizedIps) {
        const trimmedIp = ip.trim();
        if (trimmedIp && !ipRegex.test(trimmedIp)) {
          return {
            ok: false,
            error: `无效的 IP 地址: ${trimmedIp}`,
          };
        }
      }
    }

    const result = await repo.createCfOptimizedDomain(data);

    revalidatePath("/settings/cf-optimized-domains");

    // 立即刷新缓存，确保新配置生效
    await refreshCfOptimizedCache();

    logger.info("[CfOptimizedDomainsAction] Created domain", {
      domain: data.domain,
      ipsCount: data.optimizedIps.length,
      userId: session.user.id,
    });

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    logger.error("[CfOptimizedDomainsAction] Failed to create domain:", error);
    return {
      ok: false,
      error: "创建优选域名失败",
    };
  }
}

/**
 * 更新 CF 优选域名
 */
export async function updateCfOptimizedDomainAction(
  id: number,
  updates: Partial<{
    domain: string;
    optimizedIps: string[];
    description: string;
    isEnabled: boolean;
    autoTestEnabled: boolean;
    autoTestInterval: number;
  }>
): Promise<ActionResult<repo.CfOptimizedDomain>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return {
        ok: false,
        error: "权限不足",
      };
    }

    // 验证 IP 格式（如果更新了 IP 列表）
    if (updates.optimizedIps && updates.optimizedIps.length > 0) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      for (const ip of updates.optimizedIps) {
        const trimmedIp = ip.trim();
        if (trimmedIp && !ipRegex.test(trimmedIp)) {
          return {
            ok: false,
            error: `无效的 IP 地址: ${trimmedIp}`,
          };
        }
      }
    }

    const result = await repo.updateCfOptimizedDomain(id, updates);

    if (!result) {
      return {
        ok: false,
        error: "优选域名不存在",
      };
    }

    revalidatePath("/settings/cf-optimized-domains");

    // 立即刷新缓存，确保更新后的配置生效
    await refreshCfOptimizedCache();

    logger.info("[CfOptimizedDomainsAction] Updated domain", {
      id,
      updates,
      userId: session.user.id,
    });

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    logger.error("[CfOptimizedDomainsAction] Failed to update domain:", error);
    return {
      ok: false,
      error: "更新优选域名失败",
    };
  }
}

/**
 * 删除 CF 优选域名
 */
export async function deleteCfOptimizedDomainAction(id: number): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return {
        ok: false,
        error: "权限不足",
      };
    }

    const deleted = await repo.deleteCfOptimizedDomain(id);

    if (!deleted) {
      return {
        ok: false,
        error: "优选域名不存在",
      };
    }

    revalidatePath("/settings/cf-optimized-domains");

    // 立即刷新缓存，确保删除后的配置生效
    await refreshCfOptimizedCache();

    logger.info("[CfOptimizedDomainsAction] Deleted domain", {
      id,
      userId: session.user.id,
    });

    return {
      ok: true,
    };
  } catch (error) {
    logger.error("[CfOptimizedDomainsAction] Failed to delete domain:", error);
    return {
      ok: false,
      error: "删除优选域名失败",
    };
  }
}
