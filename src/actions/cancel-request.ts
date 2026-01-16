"use server";

import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis/client";
import type { ActionResult } from "./types";

/**
 * 取消正在进行中的请求
 *
 * 通过在 Redis 中设置取消标记来尝试取消请求。
 * 注意：如果请求已经发送到上游 API，可能无法真正取消，但会标记为用户已请求取消。
 *
 * @param messageRequestId - message_request 记录 ID
 */
export async function cancelPendingRequest(
  messageRequestId: number
): Promise<ActionResult<void>> {
  try {
    // 1. 验证用户权限
    const authSession = await getSession();
    if (!authSession) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    const isAdmin = authSession.user.role === "admin";
    const currentUserId = authSession.user.id;

    // 2. 查询请求记录，验证所有权和状态
    const { db } = await import("@/drizzle/db");
    const { messageRequest } = await import("@/drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const [request] = await db
      .select({
        id: messageRequest.id,
        userId: messageRequest.userId,
        statusCode: messageRequest.statusCode,
        sessionId: messageRequest.sessionId,
        requestSequence: messageRequest.requestSequence,
      })
      .from(messageRequest)
      .where(eq(messageRequest.id, messageRequestId))
      .limit(1);

    if (!request) {
      return {
        ok: false,
        error: "请求不存在",
      };
    }

    // 3. 权限检查
    if (!isAdmin && request.userId !== currentUserId) {
      logger.warn(
        `[Security] User ${currentUserId} attempted to cancel request ${messageRequestId} owned by user ${request.userId}`
      );
      return {
        ok: false,
        error: "无权取消此请求",
      };
    }

    // 4. 检查请求是否已完成
    if (request.statusCode !== null) {
      return {
        ok: false,
        error: "请求已完成，无法取消",
      };
    }

    // 5. 在 Redis 中设置取消标记
    const redis = getRedisClient();
    if (!redis || redis.status !== "ready") {
      logger.warn("Redis unavailable when attempting to cancel request", {
        messageRequestId,
      });
      return {
        ok: false,
        error: "Redis 不可用，无法设置取消标记",
      };
    }

    // 使用 sessionId 和 requestSequence 作为 key
    if (request.sessionId && request.requestSequence) {
      const cancelKey = `cancel:${request.sessionId}:${request.requestSequence}`;
      // 设置60秒过期，避免遗留数据
      await redis.setex(cancelKey, 60, "1");

      logger.info("Request cancellation requested", {
        messageRequestId,
        sessionId: request.sessionId,
        requestSequence: request.requestSequence,
        userId: currentUserId,
      });

      return {
        ok: true,
        data: undefined,
      };
    }

    return {
      ok: false,
      error: "请求缺少 Session 信息，无法取消",
    };
  } catch (error) {
    logger.error("Failed to cancel pending request:", error);
    return {
      ok: false,
      error: "取消请求失败",
    };
  }
}

/**
 * 检查请求是否已被标记为取消
 *
 * 此函数可在代理处理过程中调用，以检查用户是否请求取消
 *
 * @param sessionId - Session ID
 * @param requestSequence - 请求序号
 * @returns 是否已被标记为取消
 */
export async function isRequestCancelled(
  sessionId: string,
  requestSequence: number
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis || redis.status !== "ready") {
      return false;
    }

    const cancelKey = `cancel:${sessionId}:${requestSequence}`;
    const result = await redis.get(cancelKey);
    return result === "1";
  } catch (error) {
    logger.error("Failed to check request cancellation status:", error);
    return false;
  }
}
