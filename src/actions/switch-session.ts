"use server";

import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis/client";
import { SessionManager } from "@/lib/session-manager";
import type { ActionResult } from "./types";

/**
 * 获取会话映射的新会话ID（内部使用，不做权限检查）
 *
 * @param oldSessionId - 旧的会话ID
 * @returns 新会话ID（如果存在映射），否则返回null
 */
export async function getMappedSessionId(oldSessionId: string): Promise<string | null> {
  try {
    const redis = getRedisClient();
    if (!redis || redis.status !== "ready") {
      return null;
    }

    const mappingKey = `session_mapping:${oldSessionId}`;
    const mappingData = await redis.get(mappingKey);

    if (mappingData) {
      const mapping = JSON.parse(mappingData);
      logger.debug("Session mapping found", {
        oldSessionId,
        newSessionId: mapping.newSessionId,
      });
      return mapping.newSessionId;
    }

    return null;
  } catch (error) {
    logger.error("Failed to get mapped session ID:", error);
    return null;
  }
}

/**
 * 切换到新会话并保持映射关系
 *
 * 功能：
 * 1. 创建新的 session ID
 * 2. 在 Redis 中记录映射关系（旧session -> 新session）
 * 3. 返回新的 session ID 供客户端使用
 *
 * @param oldSessionId - 旧的 session ID
 * @returns 新的 session ID
 */
export async function switchToNewSession(
  oldSessionId: string
): Promise<ActionResult<{ newSessionId: string }>> {
  try {
    // 1. 验证用户权限
    const authSession = await getSession();
    if (!authSession) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    // 2. 使用 SessionManager 的公共方法创建会话映射
    const newSessionId = await SessionManager.createSessionMapping(
      oldSessionId,
      "user_switch",
      authSession.user.id
    );

    return {
      ok: true,
      data: { newSessionId },
    };
  } catch (error) {
    logger.error("Failed to switch session:", error);
    return {
      ok: false,
      error: "切换会话失败",
    };
  }
}

/**
 * 获取 session 的映射关系
 *
 * @param sessionId - session ID
 * @returns 映射信息（如果存在）
 */
export async function getSessionMapping(sessionId: string): Promise<
  ActionResult<{
    oldSessionId: string;
    newSessionId: string;
    createdAt: string;
    reason: "provider_failover" | "user_switch";
    userId?: number;
    providerId?: number;
  } | null>
> {
  try {
    const authSession = await getSession();
    if (!authSession) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    const redis = getRedisClient();
    if (!redis || redis.status !== "ready") {
      return {
        ok: true,
        data: null,
      };
    }

    // 尝试作为旧 session 查询
    const mappingKey = `session_mapping:${sessionId}`;
    const mappingData = await redis.get(mappingKey);

    if (mappingData) {
      const mapping = JSON.parse(mappingData);
      return {
        ok: true,
        data: {
          oldSessionId: mapping.oldSessionId,
          newSessionId: mapping.newSessionId,
          createdAt: mapping.createdAt,
          reason: mapping.reason || "user_switch",
          userId: mapping.userId,
          providerId: mapping.providerId,
        },
      };
    }

    // 尝试作为新 session 查询反向映射
    const reverseMappingKey = `session_reverse_mapping:${sessionId}`;
    const reverseMappingData = await redis.get(reverseMappingKey);

    if (reverseMappingData) {
      const mapping = JSON.parse(reverseMappingData);
      return {
        ok: true,
        data: {
          oldSessionId: mapping.oldSessionId,
          newSessionId: mapping.newSessionId,
          createdAt: mapping.createdAt,
          reason: mapping.reason || "user_switch",
          userId: mapping.userId,
          providerId: mapping.providerId,
        },
      };
    }

    return {
      ok: true,
      data: null,
    };
  } catch (error) {
    logger.error("Failed to get session mapping:", error);
    return {
      ok: false,
      error: "获取会话映射失败",
    };
  }
}
