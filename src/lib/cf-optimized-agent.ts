/**
 * Cloudflare 优选 IP Agent
 * 用于在代理请求时自动使用配置的优选 IP
 */

import { Agent } from "undici";
import { lookup as dnsLookup } from "node:dns";
import { promisify } from "node:util";
import { getOptimizedIp } from "./cf-optimized-ip-resolver";
import { logger } from "@/lib/logger";

const lookupAsync = promisify(dnsLookup);

/**
 * 创建支持 CF 优选 IP 的 Agent
 * @param targetUrl 目标 URL
 * @param options Agent 选项
 * @returns 配置了优选 IP 的 Agent，如果没有优选 IP 则返回 null
 */
export async function createCfOptimizedAgent(
  targetUrl: string,
  options: { allowH2?: boolean } = {}
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

    // 创建自定义 connect 函数，将域名解析到优选 IP
    const customConnect = (opts: any, callback: any) => {
      // 如果是目标域名，使用优选 IP
      if (opts.hostname === domain || opts.servername === domain) {
        // 修改连接选项：使用优选 IP 作为连接地址
        const modifiedOpts = {
          ...opts,
          hostname: optimizedIp, // 连接到优选 IP
          servername: domain, // 保持 SNI 为原域名（用于 TLS）
        };

        logger.debug("[CfOptimizedAgent] Connecting to optimized IP", {
          originalHost: opts.hostname,
          optimizedIp,
          servername: domain,
        });

        // 使用默认的 connect 逻辑
        return Agent.prototype.connect.call(this, modifiedOpts, callback);
      }

      // 其他域名使用默认连接
      return Agent.prototype.connect.call(this, opts, callback);
    };

    // 创建带自定义 connect 的 Agent
    return new Agent({
      ...options,
      connect: customConnect,
    });
  } catch (error) {
    logger.error("[CfOptimizedAgent] Failed to create optimized agent:", error);
    return null;
  }
}
