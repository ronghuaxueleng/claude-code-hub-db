import { logger } from "@/lib/logger";
import { getHeartbeatSettings } from "@/repository/heartbeat-settings";
import {
  findEnabledHeartbeatUrlConfigs,
  recordHeartbeatSuccess,
  recordHeartbeatFailure,
  type HeartbeatUrlConfig,
} from "@/repository/heartbeat-url-configs";

/**
 * 供应商心跳发送器
 *
 * 功能：定期向配置的URL发送心跳请求，保持上游Token缓存不过期
 * 策略：
 * - 支持多个URL配置，每个配置独立定时器
 * - 每个配置可以设置独立的心跳间隔
 * - 记录成功/失败统计信息
 */
export class ProviderHeartbeat {
  private static timers: Map<number, NodeJS.Timeout> = new Map();

  /**
   * 启动心跳任务
   */
  static async start(): Promise<void> {
    try {
      // 从数据库读取全局配置
      const settings = await getHeartbeatSettings();

      // 如果全局未启用，不启动
      if (!settings.enabled) {
        logger.info("ProviderHeartbeat: Disabled in settings, not starting");
        return;
      }

      // 获取所有启用的URL配置
      const configs = await findEnabledHeartbeatUrlConfigs();

      if (configs.length === 0) {
        logger.warn("ProviderHeartbeat: No enabled URL configs, not starting");
        return;
      }

      logger.info("ProviderHeartbeat: Starting heartbeat tasks", {
        configCount: configs.length,
      });

      // 为每个配置创建定时器
      for (const config of configs) {
        this.startConfigTimer(config);
      }
    } catch (error) {
      logger.error("ProviderHeartbeat: Failed to start", { error });
    }
  }

  /**
   * 停止所有心跳任务
   */
  static stop(): void {
    for (const [configId, timer] of this.timers.entries()) {
      clearInterval(timer);
      logger.debug("ProviderHeartbeat: Stopped timer", { configId });
    }
    this.timers.clear();
    logger.info("ProviderHeartbeat: All timers stopped");
  }

  /**
   * 重启心跳任务（先停止再启动）
   */
  static async restart(): Promise<void> {
    logger.info("ProviderHeartbeat: Restarting");
    this.stop();
    await this.start();
  }

  /**
   * 启动单个配置的定时器
   */
  private static startConfigTimer(config: HeartbeatUrlConfig): void {
    // 如果已存在定时器，先清除
    if (this.timers.has(config.id)) {
      clearInterval(this.timers.get(config.id)!);
    }

    const intervalMs = config.intervalSeconds * 1000;

    logger.info("ProviderHeartbeat: Starting timer", {
      configId: config.id,
      name: config.name,
      intervalSeconds: config.intervalSeconds,
    });

    // 立即发送一次心跳
    void this.sendHeartbeat(config).catch((error) => {
      logger.error("ProviderHeartbeat: Failed to send initial heartbeat", {
        configId: config.id,
        error,
      });
    });

    // 定期发送心跳
    const timer = setInterval(() => {
      void this.sendHeartbeat(config).catch((error) => {
        logger.error("ProviderHeartbeat: Failed to send heartbeat", {
          configId: config.id,
          error,
        });
      });
    }, intervalMs);

    this.timers.set(config.id, timer);
  }

  /**
   * 停止单个配置的定时器
   */
  private static stopConfigTimer(configId: number): void {
    const timer = this.timers.get(configId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(configId);
      logger.debug("ProviderHeartbeat: Stopped timer", { configId });
    }
  }

  /**
   * 发送心跳请求
   */
  private static async sendHeartbeat(config: HeartbeatUrlConfig): Promise<void> {
    try {
      // 验证配置完整性
      if (!config.headers || Object.keys(config.headers).length === 0) {
        logger.warn("ProviderHeartbeat: Skipping heartbeat - headers not configured", {
          configId: config.id,
          name: config.name,
        });
        return;
      }

      if (!config.body || config.body.trim() === "") {
        logger.warn("ProviderHeartbeat: Skipping heartbeat - body not configured", {
          configId: config.id,
          name: config.name,
        });
        return;
      }

      // 发送心跳请求
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      if (response.ok) {
        // 记录成功
        await recordHeartbeatSuccess(config.id);

        logger.debug("ProviderHeartbeat: Heartbeat sent successfully", {
          configId: config.id,
          name: config.name,
          url: config.url,
          statusCode: response.status,
        });
      } else {
        // 记录失败
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        await recordHeartbeatFailure(config.id, errorMessage);

        logger.warn("ProviderHeartbeat: Heartbeat failed", {
          configId: config.id,
          name: config.name,
          url: config.url,
          statusCode: response.status,
        });
      }
    } catch (error) {
      // 记录失败
      const errorMessage = error instanceof Error ? error.message : String(error);
      await recordHeartbeatFailure(config.id, errorMessage);

      logger.debug("ProviderHeartbeat: Heartbeat error", {
        configId: config.id,
        name: config.name,
        error: errorMessage,
      });
    }
  }
}
