/**
 * Cloudflare 优选 IP Agent
 * 用于在代理请求时自动使用配置的优选 IP
 */

import { Agent } from "undici";
import type { Connector } from "undici";
import { getOptimizedIp } from "./cf-optimized-ip-resolver";
import { logger } from "@/lib/logger";

/**
 * 创建支持 CF 优选 IP 的 Agent
 * @param targetUrl 目标 URL
 * @param options Agent 选项
 * @returns 配置了优选 IP 的 Agent，如果没有优选 IP 则返回 null
 */
export async function createCfOptimizedAgent(
  targetUrl: string,
  options: { allowH2?: boolean } = {},
): Promise<Agent | null> {
  try {
    const url = new URL(targetUrl);
    const domain = url.hostname;

    // 获取优选 IP
    const optimizedIp = await getOptimizedIp(domain);

    if (!optimizedIp) {
      // 没有配置优选 IP
      return null;
    }

    logger.debug("[CfOptimizedAgent] Using optimized IP", {
      domain,
      ip: optimizedIp,
    });

    // 创建自定义 connector，将域名解析到优选 IP
    const customConnector: Connector = (options, callback) => {
      // 替换 hostname 为优选 IP
      const modifiedOptions = {
        ...options,
        hostname: optimizedIp,
        servername: domain, // 保持 SNI 为原域名
      };

      // 使用默认 connector
      return Agent.prototype.connect.call(this, modifiedOptions, callback);
    };

    // 创建带自定义 connector 的 Agent
    return new Agent({
      ...options,
      connect: customConnector,
    });
  } catch (error) {
    logger.error("[CfOptimizedAgent] Failed to create optimized agent:", error);
    return null;
  }
}
