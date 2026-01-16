/**
 * Cloudflare 优选 IP Agent
 * 用于在代理请求时自动使用配置的优选 IP
 *
 * 参考 dns-cleaner 的实现，使用 undici Agent 的 connect.lookup 选项
 */

import { Agent } from "undici";
import { lookup as dnsLookup } from "node:dns";
import { getOptimizedIp } from "./cf-optimized-ip-resolver";
import { logger } from "@/lib/logger";

export interface CfOptimizedAgentResult {
  agent: Agent;
  domain: string;
  ip: string;
}

/**
 * 创建支持 CF 优选 IP 的 Agent
 * @param targetUrl 目标 URL
 * @param options Agent 选项
 * @returns 配置了优选 IP 的 Agent 和 IP 信息，如果没有优选 IP 则返回 null
 */
export async function createCfOptimizedAgent(
  targetUrl: string,
  options: { allowH2?: boolean } = {}
): Promise<CfOptimizedAgentResult | null> {
  try {
    const url = new URL(targetUrl);
    const domain = url.hostname;

    // 获取优选 IP
    const optimizedIp = await getOptimizedIp(domain);

    if (!optimizedIp) {
      // 没有配置优选 IP，返回 null，调用方会使用默认 Agent
      return null;
    }

    logger.debug("[CfOptimizedAgent] Creating agent with optimized IP", {
      domain,
      ip: optimizedIp,
    });

    // 创建自定义 lookup 函数
    const customLookup = (hostname: string, opts: any, callback: any) => {
      // 检查 options.all 参数（某些情况下 undici 会传入这个参数）
      const needsArray = opts && (opts as { all?: boolean }).all === true;

      logger.debug("[CfOptimizedAgent] lookup called", {
        hostname,
        all: needsArray,
        targetDomain: domain,
      });

      // 如果是目标域名，使用优选 IP
      if (hostname === domain) {
        if (needsArray) {
          // 返回数组格式
          callback(null, [{ address: optimizedIp, family: 4 }]);
        } else {
          // 返回单地址格式
          callback(null, optimizedIp, 4);
        }
        logger.info("[CfOptimizedAgent] Using optimized IP for domain", {
          domain: hostname,
          ip: optimizedIp,
        });
        return;
      }

      // 其他域名使用默认 DNS
      dnsLookup(hostname, opts, callback);
    };

    // 创建带自定义 lookup 的 Agent
    const agent = new Agent({
      ...options,
      connect: {
        lookup: customLookup,
      },
    });

    return {
      agent,
      domain,
      ip: optimizedIp,
    };
  } catch (error) {
    logger.error("[CfOptimizedAgent] Failed to create optimized agent:", error);
    return null;
  }
}
