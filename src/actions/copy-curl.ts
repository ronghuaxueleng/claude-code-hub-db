"use server";

import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { SessionManager } from "@/lib/session-manager";
import type { ActionResult } from "./types";

/**
 * 生成请求的curl命令
 *
 * @param sessionId - 会话ID
 * @param requestSequence - 请求序号
 * @returns curl命令字符串
 */
export async function getCurlCommand(
  sessionId: string,
  requestSequence?: number | null
): Promise<ActionResult<{ curl: string }>> {
  try {
    // 1. 验证用户权限
    const authSession = await getSession();
    if (!authSession) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    // 2. 获取请求详情
    const effectiveSequence = requestSequence ?? 1;

    const [requestBody, clientMeta, upstreamMeta, requestHeaders] = await Promise.all([
      SessionManager.getSessionRequestBody(sessionId, effectiveSequence),
      SessionManager.getSessionClientRequestMeta(sessionId, effectiveSequence),
      SessionManager.getSessionUpstreamRequestMeta(sessionId, effectiveSequence),
      SessionManager.getSessionRequestHeadersRaw(sessionId, effectiveSequence), // 使用原始 headers
    ]);

    // 3. 优先使用上游请求，fallback到客户端请求
    const url = upstreamMeta?.url || clientMeta?.url;
    const method = upstreamMeta?.method || clientMeta?.method || "POST";

    if (!url) {
      return {
        ok: false,
        error: "请求信息不完整（缺少URL）",
      };
    }

    // 4. 构建curl命令
    let curl = `curl -X ${method}`;

    // 添加URL
    curl += ` \\\n  '${url}'`;

    // 添加请求头（使用完整的原始 headers，包含完整的 authorization 和 x-api-key）
    if (requestHeaders && typeof requestHeaders === "object") {
      const headers = requestHeaders as Record<string, string>;
      for (const [key, value] of Object.entries(headers)) {
        // 跳过不必要的headers（但保留敏感headers如 authorization、x-api-key）
        if (shouldIncludeHeader(key)) {
          const escapedValue = value.replace(/'/g, "'\\''");
          curl += ` \\\n  -H '${key}: ${escapedValue}'`;
        }
      }
    }

    // 添加请求体
    if (requestBody && method !== "GET" && method !== "HEAD") {
      const body = JSON.stringify(requestBody);
      const escapedBody = body.replace(/'/g, "'\\''");
      curl += ` \\\n  -d '${escapedBody}'`;
    }

    logger.info("Generated curl command", {
      sessionId,
      requestSequence: effectiveSequence,
      userId: authSession.user.id,
    });

    return {
      ok: true,
      data: { curl },
    };
  } catch (error) {
    logger.error("Failed to generate curl command:", error);
    return {
      ok: false,
      error: "生成curl命令失败",
    };
  }
}

/**
 * 判断是否应该包含该header
 * 注意：现在使用原始 headers，敏感字段（authorization、x-api-key）会完整显示
 */
function shouldIncludeHeader(key: string): boolean {
  const lowerKey = key.toLowerCase();

  // 排除的headers
  const excludeHeaders = [
    "host", // 会自动添加
    "content-length", // 会自动计算
    "connection",
    "keep-alive",
    "transfer-encoding",
    "cookie", // 可能包含敏感信息
    "sec-", // 浏览器自动添加的安全headers
  ];

  // 敏感headers（现在会完整包含，不再遮罩）
  const sensitiveHeaders = ["authorization", "x-api-key", "api-key"];

  // 排除特定前缀
  for (const exclude of excludeHeaders) {
    if (lowerKey.startsWith(exclude)) {
      return false;
    }
  }

  // 包含敏感headers（现在使用原始值，完整显示）
  return true;
}
