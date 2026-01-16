import { getLocale } from "next-intl/server";
import { logger } from "@/lib/logger";
import { RateLimitService } from "@/lib/rate-limit";
import { getResetInfo, getResetInfoWithMode } from "@/lib/rate-limit/time-utils";
import { ERROR_CODES, getErrorMessageServer } from "@/lib/utils/error-messages";
import { RateLimitError } from "./errors";
import type { ProxySession } from "./session";

/**
 * 通用的限额信息解析函数
 * 从错误原因字符串中提取当前使用量和限制值
 * 格式：（current/limit）
 */
function parseLimitInfo(reason: string): { currentUsage: number; limitValue: number } {
  const match = reason.match(/（([\d.]+)\/([\d.]+)）/);
  const currentUsage = match ? parseFloat(match[1]) : 0;
  const limitValue = match ? parseFloat(match[2]) : 0;
  return { currentUsage, limitValue };
}

/**
 * 限流检查结果类型（用于并行化检查）
 */
interface RateLimitCheckResult {
  priority: number; // 检查优先级（1-12，数字越小优先级越高）
  allowed: boolean;
  error?: RateLimitError;
}

export class ProxyRateLimitGuard {
  /**
   * 检查限流（Key 层 + User 层）
   *
   * 检查顺序（基于 Codex 专业分析）：
   * 1-2. 永久硬限制：Key 总限额 → User 总限额
   * 3-4. 资源/频率保护：Key 并发 → User RPM
   * 5-8. 短期周期限额：Key 5h → User 5h → Key 每日 → User 每日
   * 9-12. 中长期周期限额：Key 周 → User 周 → Key 月 → User 月
   *
   * 设计原则：
   * - 硬上限优先于周期上限
   * - 同一窗口内 Key → User 交替
   * - 资源/频率保护足够靠前
   * - 高触发概率窗口优先
   */
  static async ensure(session: ProxySession): Promise<void> {
    const user = session.authState?.user;
    const key = session.authState?.key;

    if (!user || !key) return;

    // 预先获取 locale（性能优化：避免每次错误时动态导入）
    const locale = await getLocale();

    // ========== 第一层：永久硬限制（并行检查）==========

    // 并行执行 Key 和 User 总限额检查
    const [keyTotalCheck, userTotalCheck] = await Promise.all([
      RateLimitService.checkTotalCostLimit(key.id, "key", key.limitTotalUsd ?? null, {
        keyHash: key.key,
      }),
      RateLimitService.checkTotalCostLimit(user.id, "user", user.limitTotalUsd ?? null),
    ]);

    // 1. Key 总限额（用户明确要求优先检查）
    if (!keyTotalCheck.allowed) {
      logger.warn(`[RateLimit] Key total limit exceeded: key=${key.id}, ${keyTotalCheck.reason}`);

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_TOTAL_EXCEEDED, {
        current: (keyTotalCheck.current || 0).toFixed(4),
        limit: (key.limitTotalUsd || 0).toFixed(4),
      });

      const noReset = "9999-12-31T23:59:59.999Z";

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_total",
        keyTotalCheck.current || 0,
        key.limitTotalUsd || 0,
        noReset,
        null
      );
    }

    // 2. User 总限额（账号级永久预算）
    if (!userTotalCheck.allowed) {
      logger.warn(
        `[RateLimit] User total limit exceeded: user=${user.id}, ${userTotalCheck.reason}`
      );

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_TOTAL_EXCEEDED, {
        current: (userTotalCheck.current || 0).toFixed(4),
        limit: (user.limitTotalUsd || 0).toFixed(4),
      });

      const noReset = "9999-12-31T23:59:59.999Z";

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_total",
        userTotalCheck.current || 0,
        user.limitTotalUsd || 0,
        noReset,
        null
      );
    }

    // ========== 第二层：资源/频率保护（并行检查）==========

    // 并行执行 Session 限制和 RPM 检查
    const rpmCheckPromise =
      user.rpm !== null
        ? RateLimitService.checkUserRPM(user.id, user.rpm)
        : Promise.resolve({ allowed: true, current: 0, reason: null });

    const [sessionCheck, rpmCheck] = await Promise.all([
      RateLimitService.checkSessionLimit(key.id, "key", key.limitConcurrentSessions || 0),
      rpmCheckPromise,
    ]);

    // 3. Key 并发 Session（避免创建上游连接）
    if (!sessionCheck.allowed) {
      logger.warn(`[RateLimit] Key session limit exceeded: key=${key.id}, ${sessionCheck.reason}`);

      const { currentUsage, limitValue } = parseLimitInfo(sessionCheck.reason!);

      const resetTime = new Date().toISOString();

      const message = await getErrorMessageServer(
        locale,
        ERROR_CODES.RATE_LIMIT_CONCURRENT_SESSIONS_EXCEEDED,
        {
          current: String(currentUsage),
          limit: String(limitValue),
        }
      );

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "concurrent_sessions",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }

    // 4. User RPM（频率闸门，挡住高频噪声）- null 表示无限制
    if (!rpmCheck.allowed) {
      logger.warn(`[RateLimit] User RPM exceeded: user=${user.id}, ${rpmCheck.reason}`);

      const resetTime = new Date(Date.now() + 60 * 1000).toISOString();

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_RPM_EXCEEDED, {
        current: String(rpmCheck.current || 0),
        limit: String(user.rpm),
        resetTime,
      });

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "rpm",
        rpmCheck.current || 0,
        user.rpm!,
        resetTime,
        null
      );
    }

    // ========== 第三层：短期周期限额（并行检查）==========

    // 并行执行 Key 和 User 5h 限额检查
    const [key5hCheck, user5hCheck] = await Promise.all([
      RateLimitService.checkCostLimits(key.id, "key", {
        limit_5h_usd: key.limit5hUsd,
        limit_daily_usd: null,
        limit_weekly_usd: null,
        limit_monthly_usd: null,
      }),
      RateLimitService.checkCostLimits(user.id, "user", {
        limit_5h_usd: user.limit5hUsd ?? null,
        limit_daily_usd: null,
        limit_weekly_usd: null,
        limit_monthly_usd: null,
      }),
    ]);

    // 5. Key 5h 限额（最短周期，最易触发）
    if (!key5hCheck.allowed) {
      logger.warn(`[RateLimit] Key 5h limit exceeded: key=${key.id}, ${key5hCheck.reason}`);

      const { currentUsage, limitValue } = parseLimitInfo(key5hCheck.reason!);
      const resetTime = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_5H_EXCEEDED, {
        current: currentUsage.toFixed(4),
        limit: limitValue.toFixed(4),
        resetTime,
      });

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_5h",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }

    // 6. User 5h 限额（防止多 Key 合力在短窗口打爆用户）
    if (!user5hCheck.allowed) {
      logger.warn(`[RateLimit] User 5h limit exceeded: user=${user.id}, ${user5hCheck.reason}`);

      const { currentUsage, limitValue } = parseLimitInfo(user5hCheck.reason!);
      const resetTime = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_5H_EXCEEDED, {
        current: currentUsage.toFixed(4),
        limit: limitValue.toFixed(4),
        resetTime,
      });

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_5h",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }

    // 7. Key 每日限额（Key 独有的每日预算）- null 表示无限制
    const keyDailyCheck = await RateLimitService.checkCostLimits(key.id, "key", {
      limit_5h_usd: null,
      limit_daily_usd: key.limitDailyUsd,
      daily_reset_mode: key.dailyResetMode,
      daily_reset_time: key.dailyResetTime,
      limit_weekly_usd: null,
      limit_monthly_usd: null,
    });

    if (!keyDailyCheck.allowed) {
      logger.warn(`[RateLimit] Key daily limit exceeded: key=${key.id}, ${keyDailyCheck.reason}`);

      const { currentUsage, limitValue } = parseLimitInfo(keyDailyCheck.reason!);

      const resetInfo = getResetInfoWithMode("daily", key.dailyResetTime, key.dailyResetMode);
      // rolling 模式没有 resetAt，使用 24 小时后作为 fallback
      const resetTime =
        resetInfo.resetAt?.toISOString() ??
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const message = await getErrorMessageServer(
        locale,
        ERROR_CODES.RATE_LIMIT_DAILY_QUOTA_EXCEEDED,
        {
          current: currentUsage.toFixed(4),
          limit: limitValue.toFixed(4),
          resetTime,
        }
      );

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "daily_quota",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }

    // 8. User 每日额度（User 独有的常用预算）- null 表示无限制
    if (user.dailyQuota !== null) {
      const dailyCheck = await RateLimitService.checkUserDailyCost(
        user.id,
        user.dailyQuota,
        user.dailyResetTime,
        user.dailyResetMode
      );

      if (!dailyCheck.allowed) {
        logger.warn(`[RateLimit] User daily limit exceeded: user=${user.id}, ${dailyCheck.reason}`);

        // 使用用户配置的重置时间和模式计算正确的 resetTime
        const resetInfo = getResetInfoWithMode("daily", user.dailyResetTime, user.dailyResetMode);
        // rolling 模式没有 resetAt，使用 24 小时后作为 fallback
        const resetTime =
          resetInfo.resetAt?.toISOString() ??
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const { getLocale } = await import("next-intl/server");
        const locale = await getLocale();
        const message = await getErrorMessageServer(
          locale,
          ERROR_CODES.RATE_LIMIT_DAILY_QUOTA_EXCEEDED,
          {
            current: (dailyCheck.current || 0).toFixed(4),
            limit: user.dailyQuota.toFixed(4),
            resetTime,
          }
        );

        throw new RateLimitError(
          "rate_limit_error",
          message,
          "daily_quota",
          dailyCheck.current || 0,
          user.dailyQuota,
          resetTime,
          null
        );
      }
    }

    // ========== 第四层：中长期周期限额（并行检查）==========

    // 并行执行周限额和月限额检查
    const [keyWeeklyCheck, userWeeklyCheck, keyMonthlyCheck, userMonthlyCheck] = await Promise.all([
      RateLimitService.checkCostLimits(key.id, "key", {
        limit_5h_usd: null,
        limit_daily_usd: null,
        limit_weekly_usd: key.limitWeeklyUsd,
        limit_monthly_usd: null,
      }),
      RateLimitService.checkCostLimits(user.id, "user", {
        limit_5h_usd: null,
        limit_daily_usd: null,
        limit_weekly_usd: user.limitWeeklyUsd ?? null,
        limit_monthly_usd: null,
      }),
      RateLimitService.checkCostLimits(key.id, "key", {
        limit_5h_usd: null,
        limit_daily_usd: null,
        limit_weekly_usd: null,
        limit_monthly_usd: key.limitMonthlyUsd,
      }),
      RateLimitService.checkCostLimits(user.id, "user", {
        limit_5h_usd: null,
        limit_daily_usd: null,
        limit_weekly_usd: null,
        limit_monthly_usd: user.limitMonthlyUsd ?? null,
      }),
    ]);

    // 9. Key 周限额
    if (!keyWeeklyCheck.allowed) {
      logger.warn(`[RateLimit] Key weekly limit exceeded: key=${key.id}, ${keyWeeklyCheck.reason}`);

      const { currentUsage, limitValue } = parseLimitInfo(keyWeeklyCheck.reason!);
      const resetInfo = getResetInfo("weekly");
      const resetTime = resetInfo.resetAt?.toISOString() || new Date().toISOString();

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_WEEKLY_EXCEEDED, {
        current: currentUsage.toFixed(4),
        limit: limitValue.toFixed(4),
        resetTime,
      });

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_weekly",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }

    // 10. User 周限额
    if (!userWeeklyCheck.allowed) {
      logger.warn(
        `[RateLimit] User weekly limit exceeded: user=${user.id}, ${userWeeklyCheck.reason}`
      );

      const { currentUsage, limitValue } = parseLimitInfo(userWeeklyCheck.reason!);
      const resetInfo = getResetInfo("weekly");
      const resetTime = resetInfo.resetAt?.toISOString() || new Date().toISOString();

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_WEEKLY_EXCEEDED, {
        current: currentUsage.toFixed(4),
        limit: limitValue.toFixed(4),
        resetTime,
      });

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_weekly",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }

    // 11. Key 月限额
    if (!keyMonthlyCheck.allowed) {
      logger.warn(
        `[RateLimit] Key monthly limit exceeded: key=${key.id}, ${keyMonthlyCheck.reason}`
      );

      const { currentUsage, limitValue } = parseLimitInfo(keyMonthlyCheck.reason!);
      const resetInfo = getResetInfo("monthly");
      const resetTime = resetInfo.resetAt?.toISOString() || new Date().toISOString();

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_MONTHLY_EXCEEDED, {
        current: currentUsage.toFixed(4),
        limit: limitValue.toFixed(4),
        resetTime,
      });

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_monthly",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }

    // 12. User 月限额（最后一道长期预算闸门）
    if (!userMonthlyCheck.allowed) {
      logger.warn(
        `[RateLimit] User monthly limit exceeded: user=${user.id}, ${userMonthlyCheck.reason}`
      );

      const { currentUsage, limitValue } = parseLimitInfo(userMonthlyCheck.reason!);
      const resetInfo = getResetInfo("monthly");
      const resetTime = resetInfo.resetAt?.toISOString() || new Date().toISOString();

      const message = await getErrorMessageServer(locale, ERROR_CODES.RATE_LIMIT_MONTHLY_EXCEEDED, {
        current: currentUsage.toFixed(4),
        limit: limitValue.toFixed(4),
        resetTime,
      });

      throw new RateLimitError(
        "rate_limit_error",
        message,
        "usd_monthly",
        currentUsage,
        limitValue,
        resetTime,
        null
      );
    }
  }
}
