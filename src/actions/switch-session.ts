"use server";

import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis/client";
import { SessionManager } from "@/lib/session-manager";
import type { ActionResult } from "./types";

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

    // 2. 生成新的 session ID
    const newSessionId = SessionManager.generateSessionId();

    // 3. 在 Redis 中记录映射关系
    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      // 映射关系 key: session_mapping:{oldSessionId}
      const mappingKey = `session_mapping:${oldSessionId}`;

      // 存储映射关系（保留 7 天）
      await redis.setex(
        mappingKey,
        7 * 24 * 60 * 60, // 7天过期
        JSON.stringify({
          oldSessionId,
          newSessionId,
          userId: authSession.user.id,
          createdAt: new Date().toISOString(),
          reason: "user_switch",
        })
      );

      // 反向映射：new -> old（用于追溯）
      const reverseMappingKey = `session_reverse_mapping:${newSessionId}`;
      await redis.setex(
        reverseMappingKey,
        7 * 24 * 60 * 60,
        JSON.stringify({
          oldSessionId,
          newSessionId,
          userId: authSession.user.id,
          createdAt: new Date().toISOString(),
        })
      );

      logger.info("Session switched with mapping", {
        oldSessionId,
        newSessionId,
        userId: authSession.user.id,
      });
    } else {
      logger.warn("Redis unavailable, session mapping not stored", {
        oldSessionId,
        newSessionId,
      });
    }

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
export async function getSessionMapping(
  sessionId: string
): Promise<ActionResult<{
  oldSessionId: string;
  newSessionId: string;
  createdAt: string;
} | null>> {
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
