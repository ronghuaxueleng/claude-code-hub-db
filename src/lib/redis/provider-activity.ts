import { getRedisClient } from "./client";
import { logger } from "@/lib/logger";

/**
 * 供应商活跃状态数据结构
 */
export interface ProviderActivity {
  providerId: number;
  url: string;
  lastSuccessAt: number; // 最后一次成功时间（毫秒时间戳）
  totalSuccesses: number; // 总成功次数
  firstSuccessAt: number; // 首次成功时间
  models: string[]; // 最近成功的模型列表（用于心跳）
  endpoints: string[]; // 最近成功的端点列表（用于心跳）
  headers?: Record<string, string>; // 最近成功请求的请求头（用于心跳）
}

/**
 * 供应商活跃状态管理器
 *
 * 功能：
 * - 当转发请求成功时，记录供应商的活跃状态
 * - 针对 URL 级别（每个供应商独立）
 * - 持续请求时自动续期，暂停后自动过期
 * - 不发送额外的心跳请求（仅依赖真实请求）
 */
export class ProviderActivityManager {
  /**
   * 默认 TTL（秒）
   * - 5 分钟：与 Session 缓存时间一致
   * - 持续有请求时会自动续期
   * - 暂停请求后 5 分钟自动过期
   */
  private static readonly DEFAULT_TTL_SECONDS = 300;

  /**
   * Redis Key 前缀
   */
  private static readonly KEY_PREFIX = "provider:activity";

  /**
   * 构建 Redis Key
   */
  private static buildKey(providerId: number): string {
    return `${this.KEY_PREFIX}:${providerId}`;
  }

  /**
   * 记录供应商请求成功（续期）
   *
   * @param providerId 供应商 ID
   * @param url 供应商 URL
   * @param model 成功的模型名称
   * @param endpoint 成功的端点路径（如 /v1/chat/completions）
   * @param headers 成功请求的请求头（用于心跳复用）
   * @param ttlSeconds 过期时间（秒），默认 300 秒
   *
   * 使用场景：
   * - 在 forwarder.ts 的 recordSuccess() 之后调用
   * - 每次请求成功都会续期 TTL
   */
  static async recordSuccess(
    providerId: number,
    url: string,
    model?: string,
    endpoint?: string,
    headers?: Record<string, string>,
    ttlSeconds: number = this.DEFAULT_TTL_SECONDS
  ): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      // Redis 未启用，静默失败（不影响主流程）
      return;
    }

    const key = this.buildKey(providerId);
    const now = Date.now();

    try {
      // 获取现有数据（如果存在）
      const existing = await redis.get(key);
      let activity: ProviderActivity;

      if (existing) {
        // 已存在：增量更新
        const parsed = JSON.parse(existing) as ProviderActivity;

        // 更新模型列表（去重，最多保留最近 10 个模型）
        const models = new Set(parsed.models || []);
        if (model) {
          models.add(model);
        }
        const modelArray = Array.from(models).slice(-10);

        // 更新端点列表（去重，最多保留最近 5 个端点）
        const endpoints = new Set(parsed.endpoints || []);
        if (endpoint) {
          endpoints.add(endpoint);
        }
        const endpointArray = Array.from(endpoints).slice(-5);

        activity = {
          ...parsed,
          lastSuccessAt: now,
          totalSuccesses: parsed.totalSuccesses + 1,
          url, // 更新 URL（防止配置变更）
          models: modelArray,
          endpoints: endpointArray,
          headers: headers || parsed.headers, // 更新请求头（用于心跳）
        };
      } else {
        // 首次记录
        activity = {
          providerId,
          url,
          lastSuccessAt: now,
          totalSuccesses: 1,
          firstSuccessAt: now,
          models: model ? [model] : [],
          endpoints: endpoint ? [endpoint] : [],
          headers: headers, // 保存请求头（用于心跳）
        };
      }

      // 写入 Redis 并设置 TTL（续期）
      await redis.setex(key, ttlSeconds, JSON.stringify(activity));

      logger.debug("[ProviderActivity] Activity recorded and renewed", {
        providerId,
        url,
        model,
        endpoint,
        ttlSeconds,
        totalSuccesses: activity.totalSuccesses,
        modelsCount: activity.models.length,
        endpointsCount: activity.endpoints.length,
        lastSuccessAt: new Date(activity.lastSuccessAt).toISOString(),
      });
    } catch (error) {
      // 出错不影响主流程，仅记录日志
      logger.warn("[ProviderActivity] Failed to record activity", {
        providerId,
        url,
        model,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 检查供应商是否活跃
   *
   * @param providerId 供应商 ID
   * @returns 是否活跃（true = 最近有成功请求）
   */
  static async isActive(providerId: number): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) {
      // Redis 未启用，返回 true（不影响选择）
      return true;
    }

    try {
      const key = this.buildKey(providerId);
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.warn("[ProviderActivity] Failed to check activity", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      // 出错时返回 true（降级策略：不影响选择）
      return true;
    }
  }

  /**
   * 获取供应商活跃状态详情
   *
   * @param providerId 供应商 ID
   * @returns 活跃状态详情（null = 不活跃或已过期）
   */
  static async getActivity(providerId: number): Promise<ProviderActivity | null> {
    const redis = getRedisClient();
    if (!redis) {
      return null;
    }

    try {
      const key = this.buildKey(providerId);
      const value = await redis.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as ProviderActivity;
    } catch (error) {
      logger.warn("[ProviderActivity] Failed to get activity", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 获取剩余 TTL（秒）
   *
   * @param providerId 供应商 ID
   * @returns 剩余 TTL（秒），-1 = 不存在，-2 = 没有过期时间
   */
  static async getRemainingTtl(providerId: number): Promise<number> {
    const redis = getRedisClient();
    if (!redis) {
      return -1;
    }

    try {
      const key = this.buildKey(providerId);
      return await redis.ttl(key);
    } catch (error) {
      logger.warn("[ProviderActivity] Failed to get TTL", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return -1;
    }
  }

  /**
   * 手动续期（不增加成功计数）
   *
   * @param providerId 供应商 ID
   * @param ttlSeconds 过期时间（秒）
   * @returns 是否成功续期
   *
   * 使用场景：
   * - 管理员手动操作
   * - 定时任务刷新
   */
  static async renew(
    providerId: number,
    ttlSeconds: number = this.DEFAULT_TTL_SECONDS
  ): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) {
      return false;
    }

    try {
      const key = this.buildKey(providerId);
      const exists = await redis.exists(key);

      if (exists === 0) {
        logger.debug("[ProviderActivity] Cannot renew non-existent activity", {
          providerId,
        });
        return false;
      }

      // 仅续期，不修改数据
      const result = await redis.expire(key, ttlSeconds);

      if (result === 1) {
        logger.debug("[ProviderActivity] Activity renewed", {
          providerId,
          ttlSeconds,
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.warn("[ProviderActivity] Failed to renew activity", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 清除供应商活跃状态
   *
   * @param providerId 供应商 ID
   *
   * 使用场景：
   * - 供应商被禁用
   * - 供应商被删除
   * - 管理员手动清理
   */
  static async clear(providerId: number): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }

    try {
      const key = this.buildKey(providerId);
      await redis.del(key);

      logger.debug("[ProviderActivity] Activity cleared", {
        providerId,
      });
    } catch (error) {
      logger.warn("[ProviderActivity] Failed to clear activity", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 批量获取供应商活跃状态
   *
   * @param providerIds 供应商 ID 列表
   * @returns Map<providerId, isActive>
   *
   * 使用场景：
   * - Dashboard 显示
   * - 供应商选择时批量检查
   */
  static async batchCheckActive(providerIds: number[]): Promise<Map<number, boolean>> {
    const redis = getRedisClient();
    const result = new Map<number, boolean>();

    if (!redis || providerIds.length === 0) {
      // Redis 未启用或无数据，全部返回 true
      for (const id of providerIds) {
        result.set(id, true);
      }
      return result;
    }

    try {
      const keys = providerIds.map((id) => this.buildKey(id));
      const pipeline = redis.pipeline();

      for (const key of keys) {
        pipeline.exists(key);
      }

      const results = await pipeline.exec();

      if (results) {
        for (let i = 0; i < providerIds.length; i++) {
          const [error, exists] = results[i];
          if (error) {
            result.set(providerIds[i], true); // 出错时默认活跃
          } else {
            result.set(providerIds[i], exists === 1);
          }
        }
      }

      return result;
    } catch (error) {
      logger.warn("[ProviderActivity] Failed to batch check activity", {
        providerIds,
        error: error instanceof Error ? error.message : String(error),
      });

      // 出错时全部返回 true（降级策略）
      for (const id of providerIds) {
        result.set(id, true);
      }
      return result;
    }
  }

  /**
   * 获取所有活跃供应商的统计信息
   *
   * @returns 活跃供应商列表
   *
   * 使用场景：
   * - Dashboard 显示
   * - 监控告警
   */
  static async getAllActive(): Promise<ProviderActivity[]> {
    const redis = getRedisClient();
    if (!redis) {
      return [];
    }

    try {
      const pattern = `${this.KEY_PREFIX}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.get(key);
      }

      const results = await pipeline.exec();
      const activities: ProviderActivity[] = [];

      if (results) {
        for (const [error, value] of results) {
          if (!error && value) {
            try {
              activities.push(JSON.parse(value as string) as ProviderActivity);
            } catch (parseError) {
              logger.warn("[ProviderActivity] Failed to parse activity", {
                value,
                parseError,
              });
            }
          }
        }
      }

      return activities;
    } catch (error) {
      logger.warn("[ProviderActivity] Failed to get all active providers", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
