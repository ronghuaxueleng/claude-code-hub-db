import { logger } from "@/lib/logger";
import { findAllProviders } from "@/repository/provider";
import { getHeartbeatSettings } from "@/repository/heartbeat-settings";
import { parseCurlCommand } from "@/lib/utils/curl-parser";

/**
 * 供应商心跳发送器
 *
 * 功能：定期向活跃的上游供应商发送心跳请求，保持上游 Token 缓存不过期
 * 策略：
 * - 使用数据库中保存的成功请求 curl 命令
 * - 从 curl 命令中解析出 URL、headers、body 等信息
 * - 定期发送心跳请求
 */
export class ProviderHeartbeat {
  private static intervalId: NodeJS.Timeout | null = null;
  private static currentIntervalSeconds: number = 30; // 当前使用的间隔时间

  /**
   * 启动心跳任务
   */
  static async start(): Promise<void> {
    if (this.intervalId) {
      logger.warn("ProviderHeartbeat: Already running");
      return;
    }

    try {
      // 从数据库读取配置
      const settings = await getHeartbeatSettings();

      // 如果未启用，不启动
      if (!settings.enabled) {
        logger.info("ProviderHeartbeat: Disabled in settings, not starting");
        return;
      }

      // 如果没有选中的 curl，不启动
      if (settings.selectedCurlIndex === null || !settings.savedCurls[settings.selectedCurlIndex]) {
        logger.warn("ProviderHeartbeat: No curl selected, not starting");
        return;
      }

      this.currentIntervalSeconds = settings.intervalSeconds;
      const intervalMs = settings.intervalSeconds * 1000;

      logger.info("ProviderHeartbeat: Starting heartbeat task", {
        intervalSeconds: settings.intervalSeconds,
        selectedCurlIndex: settings.selectedCurlIndex,
      });

      // 立即发送一次心跳
      void this.sendHeartbeat().catch((error) => {
        logger.error("ProviderHeartbeat: Failed to send initial heartbeat", { error });
      });

      // 定期发送心跳
      this.intervalId = setInterval(() => {
        void this.sendHeartbeat().catch((error) => {
          logger.error("ProviderHeartbeat: Failed to send heartbeat", { error });
        });
      }, intervalMs);
    } catch (error) {
      logger.error("ProviderHeartbeat: Failed to start", { error });
    }
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
   * 发送心跳请求
   */
  private static async sendHeartbeat(): Promise<void> {
    try {
      // 从数据库读取配置
      const settings = await getHeartbeatSettings();

      // 如果已禁用，停止任务
      if (!settings.enabled) {
        logger.info("ProviderHeartbeat: Disabled in settings, stopping task");
        this.stop();
        return;
      }

      // 如果没有选中的 curl，停止任务
      if (settings.selectedCurlIndex === null) {
        logger.warn("ProviderHeartbeat: No curl selected, stopping task");
        this.stop();
        return;
      }

      const selectedCurl = settings.savedCurls[settings.selectedCurlIndex];
      if (!selectedCurl) {
        logger.warn("ProviderHeartbeat: Selected curl not found, stopping task");
        this.stop();
        return;
      }

      // 解析 curl 命令
      const parsed = parseCurlCommand(selectedCurl.curl);
      if (!parsed) {
        logger.error("ProviderHeartbeat: Failed to parse curl command", {
          providerId: selectedCurl.providerId,
        });
        return;
      }

      // 发送心跳请求
      const response = await fetch(parsed.url, {
        method: parsed.method,
        headers: parsed.headers,
        body: parsed.body,
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      if (response.ok) {
        logger.debug("ProviderHeartbeat: Heartbeat sent successfully", {
          providerId: selectedCurl.providerId,
          providerName: selectedCurl.providerName,
          endpoint: selectedCurl.endpoint,
          statusCode: response.status,
        });
      } else {
        logger.warn("ProviderHeartbeat: Heartbeat failed", {
          providerId: selectedCurl.providerId,
          providerName: selectedCurl.providerName,
          endpoint: selectedCurl.endpoint,
          statusCode: response.status,
        });
      }
    } catch (error) {
      logger.debug("ProviderHeartbeat: Heartbeat error (ignored)", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
