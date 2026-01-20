/**
 * CF IP 自动测速调度器
 * 定期检查并测试启用了自动测速的域名
 */

import { testCfOptimizedIps } from "@/actions/cf-ip-test";
import { refreshCache } from "@/lib/cf-optimized-ip-resolver";
import { logger } from "@/lib/logger";
import {
  getAllCfOptimizedDomains,
  updateCfOptimizedDomain,
} from "@/repository/cf-optimized-domains";

const schedulerState = globalThis as unknown as {
  __CCH_CF_IP_AUTO_TEST_STARTED__?: boolean;
  __CCH_CF_IP_AUTO_TEST_INTERVAL_ID__?: ReturnType<typeof setInterval>;
};

/**
 * 执行一次自动测速检查
 * 遍历所有启用了自动测速的域名，根据测速间隔判断是否需要测速
 */
async function runAutoTestCheck(): Promise<void> {
  try {
    const domains = await getAllCfOptimizedDomains();
    const now = new Date();

    for (const domain of domains) {
      // 跳过未启用或未启用自动测速的域名
      if (!domain.isEnabled || !domain.autoTestEnabled) {
        continue;
      }

      // 检查是否到了测速时间
      const intervalMs = (domain.autoTestInterval || 60) * 60 * 1000; // 转换为毫秒
      const lastTestTime = domain.lastAutoTestAt?.getTime() || 0;
      const nextTestTime = lastTestTime + intervalMs;

      if (now.getTime() < nextTestTime) {
        // 还没到测速时间
        continue;
      }

      logger.info("[CfIpAutoTestScheduler] Starting auto test", {
        domain: domain.domain,
        lastTestAt: domain.lastAutoTestAt,
        intervalMinutes: domain.autoTestInterval,
      });

      try {
        // 执行测速（获取前 5 个最优 IP）
        const results = await testCfOptimizedIps(domain.domain, 5);

        if (results.length > 0) {
          // 更新优选 IP
          const newIps = results.map((r) => r.ip);
          await updateCfOptimizedDomain(domain.id, {
            optimizedIps: newIps,
            lastAutoTestAt: now,
          });

          // 刷新缓存
          await refreshCache();

          logger.info("[CfIpAutoTestScheduler] Auto test completed", {
            domain: domain.domain,
            ipsCount: newIps.length,
            avgLatency: results.reduce((sum, r) => sum + r.avgLatency, 0) / results.length,
          });
        } else {
          // 没有找到可用 IP，只更新测试时间
          await updateCfOptimizedDomain(domain.id, {
            lastAutoTestAt: now,
          });

          logger.warn("[CfIpAutoTestScheduler] No available IPs found", {
            domain: domain.domain,
          });
        }
      } catch (error) {
        logger.error("[CfIpAutoTestScheduler] Auto test failed", {
          domain: domain.domain,
          error: error instanceof Error ? error.message : String(error),
        });

        // 即使失败也更新测试时间，避免频繁重试
        await updateCfOptimizedDomain(domain.id, {
          lastAutoTestAt: now,
        });
      }
    }
  } catch (error) {
    logger.error("[CfIpAutoTestScheduler] Auto test check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 启动 CF IP 自动测速调度器
 * 每 5 分钟检查一次是否有需要测速的域名
 */
export async function startCfIpAutoTestScheduler(): Promise<void> {
  if (schedulerState.__CCH_CF_IP_AUTO_TEST_STARTED__) {
    return;
  }

  try {
    const checkIntervalMs = 5 * 60 * 1000; // 每 5 分钟检查一次

    // 启动后延迟 1 分钟再执行第一次检查（避免启动时负载过高）
    setTimeout(() => {
      runAutoTestCheck().catch((error) => {
        logger.warn("[CfIpAutoTestScheduler] Initial check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 60 * 1000);

    // 设置定时检查
    schedulerState.__CCH_CF_IP_AUTO_TEST_INTERVAL_ID__ = setInterval(() => {
      runAutoTestCheck().catch((error) => {
        logger.warn("[CfIpAutoTestScheduler] Scheduled check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, checkIntervalMs);

    schedulerState.__CCH_CF_IP_AUTO_TEST_STARTED__ = true;
    logger.info("[CfIpAutoTestScheduler] Scheduler started", {
      checkIntervalMinutes: checkIntervalMs / 60000,
    });
  } catch (error) {
    logger.warn("[CfIpAutoTestScheduler] Scheduler init failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 停止 CF IP 自动测速调度器
 */
export function stopCfIpAutoTestScheduler(): void {
  if (schedulerState.__CCH_CF_IP_AUTO_TEST_INTERVAL_ID__) {
    clearInterval(schedulerState.__CCH_CF_IP_AUTO_TEST_INTERVAL_ID__);
    schedulerState.__CCH_CF_IP_AUTO_TEST_INTERVAL_ID__ = undefined;
    schedulerState.__CCH_CF_IP_AUTO_TEST_STARTED__ = false;
    logger.info("[CfIpAutoTestScheduler] Scheduler stopped");
  }
}
