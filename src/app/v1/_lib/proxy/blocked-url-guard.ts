/**
 * URL 禁用守卫
 *
 * 职责：
 * - 检查请求的目标 URL 是否在禁用列表中
 * - 支持路径匹配（以 / 开头）和完整 URL 匹配（以 http 开头）
 * - 记录被拦截的请求到数据库（不计费）
 * - 返回详细的拦截信息给用户
 *
 * 调用时机：
 * - 供应商选择完成后
 * - 实际转发请求前
 * - 避免对被禁用 URL 发起请求
 */

import { db } from "@/drizzle/db";
import { messageRequest } from "@/drizzle/schema";
import { logger } from "@/lib/logger";
import { getSystemSettings } from "@/repository/system-config";
import { ProxyResponses } from "./responses";
import type { ProxySession } from "./session";

export class ProxyBlockedUrlGuard {
  /**
   * 检查请求 URL 是否被禁用
   *
   * @returns 如果 URL 被禁用，返回 Response；否则返回 null（放行）
   */
  static async ensure(session: ProxySession): Promise<Response | null> {
    try {
      const provider = session.provider;
      if (!provider) {
        return null;
      }

      // 获取系统配置中的禁用 URL 列表
      const settings = await getSystemSettings();
      const blockedUrls = settings.blockedUrls || [];

      if (blockedUrls.length === 0) {
        return null; // 无禁用规则，放行
      }

      // 获取需要检查的 URL 信息
      const providerUrl = (provider.url || "").toLowerCase();
      const requestPath = session.requestUrl.pathname.toLowerCase();

      // 构建完整的上游请求 URL（供应商 URL + 请求路径）
      let fullUpstreamUrl = "";
      if (providerUrl) {
        try {
          const baseUrl = new URL(providerUrl);
          baseUrl.pathname = requestPath;
          fullUpstreamUrl = baseUrl.href.toLowerCase();
        } catch {
          fullUpstreamUrl = "";
        }
      }

      // 检查是否匹配任何禁用规则
      const matchedRule = blockedUrls.find((blocked) => {
        const blockedLower = blocked.toLowerCase().trim();
        if (!blockedLower) return false;

        // 1. 如果配置的是路径（以 / 开头），检查请求路径
        if (blockedLower.startsWith("/")) {
          return requestPath.includes(blockedLower);
        }

        // 2. 如果配置的是完整 URL（以 http 开头），检查上游完整 URL 或供应商 URL
        if (blockedLower.startsWith("http://") || blockedLower.startsWith("https://")) {
          return providerUrl.includes(blockedLower) || fullUpstreamUrl.includes(blockedLower);
        }

        // 3. 其他情况：同时检查供应商 URL、请求路径和完整上游 URL
        return (
          providerUrl.includes(blockedLower) ||
          requestPath.includes(blockedLower) ||
          fullUpstreamUrl.includes(blockedLower)
        );
      });

      if (matchedRule) {
        // 记录到日志
        logger.warn("[BlockedUrlGuard] Blocked request", {
          userId: session.authState?.user?.id,
          userName: session.authState?.user?.name,
          keyId: session.authState?.key?.id,
          sessionId: session.sessionId,
          matchedRule: matchedRule,
          requestPath: session.requestUrl.pathname,
          providerUrl: providerUrl,
        });

        // 记录到数据库（异步，不阻塞响应）
        void ProxyBlockedUrlGuard.logBlockedRequest(session, matchedRule);

        // 返回错误响应（不抛出异常，避免计入熔断器）
        return ProxyResponses.buildError(
          403,
          `请求被系统策略拦截。匹配规则："${matchedRule}"，请求路径：${session.requestUrl.pathname}`
        );
      }

      return null; // 通过检测，放行
    } catch (error) {
      // 记录日志但放行，避免守卫故障阻塞正常请求
      logger.error("[BlockedUrlGuard] Detection error:", error);
      return null;
    }
  }

  /**
   * 记录被拦截的请求到数据库
   */
  private static async logBlockedRequest(
    session: ProxySession,
    matchedRule: string
  ): Promise<void> {
    try {
      if (!session.authState?.user || !session.authState?.key || !session.authState?.apiKey) {
        logger.warn("[BlockedUrlGuard] Cannot log blocked request: missing auth state");
        return;
      }

      // 使用 provider_id = 0 表示被拦截的请求（未真正转发到 provider）
      await db.insert(messageRequest).values({
        providerId: 0, // 特殊值：表示被拦截
        userId: session.authState.user.id,
        key: session.authState.apiKey,
        model: session.request.model ?? undefined,
        sessionId: session.sessionId ?? undefined,
        statusCode: 403,
        costUsd: "0", // 不计费
        blockedBy: "blocked_url",
        blockedReason: JSON.stringify({
          matchedRule: matchedRule,
          requestPath: session.requestUrl.pathname,
        }),
        errorMessage: `请求被系统策略拦截。匹配规则："${matchedRule}"`,
      });

      logger.info("[BlockedUrlGuard] Blocked request logged to database", {
        userId: session.authState.user.id,
        matchedRule: matchedRule,
      });
    } catch (error) {
      logger.error("[BlockedUrlGuard] Failed to log blocked request:", error);
      // 失败不影响拦截行为
    }
  }
}
