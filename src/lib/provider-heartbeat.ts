import { logger } from "@/lib/logger";
import { ProviderActivityManager } from "@/lib/redis/provider-activity";
import { findAllProviders } from "@/repository/provider";
import { buildProxyUrl } from "@/app/v1/_lib/url";

/**
 * 供应商心跳发送器
 *
 * 功能：定期向活跃的上游供应商发送心跳请求，保持上游 Token 缓存不过期
 * 策略：只对最近有成功请求的供应商发送心跳（避免无意义的心跳）
 */
export class ProviderHeartbeat {
  private static intervalId: NodeJS.Timeout | null = null;
  private static readonly HEARTBEAT_INTERVAL = 30000; // 30秒
  private static readonly ACTIVITY_WINDOW = 300000; // 5分钟内有活跃才发送心跳

  /**
   * 启动心跳任务
   */
  static start(): void {
    if (this.intervalId) {
      logger.warn("ProviderHeartbeat: Already running");
      return;
    }

    logger.info("ProviderHeartbeat: Starting heartbeat task", {
      interval: this.HEARTBEAT_INTERVAL,
      activityWindow: this.ACTIVITY_WINDOW,
    });

    this.intervalId = setInterval(() => {
      void this.sendHeartbeats().catch((error) => {
        logger.error("ProviderHeartbeat: Failed to send heartbeats", { error });
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * 停止心跳任务
   */
  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("ProviderHeartbeat: Stopped");
    }
  }

  /**
   * 发送心跳到所有活跃的供应商
   */
  private static async sendHeartbeats(): Promise<void> {
    try {
      const providers = await findAllProviders();
      const activeProviderIds: number[] = [];

      // 检查哪些供应商最近有活跃且已启用
      for (const provider of providers) {
        if (!provider.is_enabled) {
          continue; // 跳过未启用的供应商
        }
        const isActive = await ProviderActivityManager.isActive(provider.id);
        if (isActive) {
          activeProviderIds.push(provider.id);
        }
      }

      if (activeProviderIds.length === 0) {
        logger.debug("ProviderHeartbeat: No active providers, skipping");
        return;
      }

      logger.debug("ProviderHeartbeat: Sending heartbeats", {
        activeCount: activeProviderIds.length,
        totalCount: providers.length,
      });

      // 并发发送心跳
      await Promise.allSettled(
        providers
          .filter((p) => activeProviderIds.includes(p.id))
          .map((provider) => this.sendHeartbeat(provider.id, provider.url, provider.key))
      );
    } catch (error) {
      logger.error("ProviderHeartbeat: Failed to process heartbeats", { error });
    }
  }

  /**
   * 向单个供应商发送心跳请求
   */
  private static async sendHeartbeat(providerId: number, url: string, key: string): Promise<void> {
    try {
      // 获取该供应商最近成功的模型和端点列表
      const activity = await ProviderActivityManager.getActivity(providerId);
      if (!activity || !activity.models || activity.models.length === 0) {
        logger.debug("ProviderHeartbeat: No models found for provider", {
          providerId,
        });
        return;
      }

      if (!activity.endpoints || activity.endpoints.length === 0) {
        logger.debug("ProviderHeartbeat: No endpoints found for provider", {
          providerId,
        });
        return;
      }

      // 随机选择一个最近成功的模型和端点
      const model = activity.models[Math.floor(Math.random() * activity.models.length)];
      const endpoint = activity.endpoints[Math.floor(Math.random() * activity.endpoints.length)];

      // 使用 buildProxyUrl 构建完整的心跳请求 URL
      const requestUrl = new URL(`https://dummy.com${endpoint}`);
      const heartbeatUrl = buildProxyUrl(url, requestUrl);

      // 发送最小的聊天请求（用于触发上游 Token 缓存续期）
      const response = await fetch(heartbeatUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: "ping",
            },
          ],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      if (response.ok) {
        logger.debug("ProviderHeartbeat: Heartbeat sent successfully", {
          providerId,
          model,
          endpoint,
          url: new URL(url).origin,
        });
      } else {
        logger.warn("ProviderHeartbeat: Heartbeat failed", {
          providerId,
          model,
          endpoint,
          statusCode: response.status,
        });
      }
    } catch (error) {
      logger.debug("ProviderHeartbeat: Heartbeat error (ignored)", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
