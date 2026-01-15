/**
 * Cloudflare 优选 IP 解析器
 * 用于在代理请求时自动使用配置的优选 IP
 */

import { getActiveCfOptimizedDomains } from "@/repository/cf-optimized-domains";
import { getBlacklistedIps } from "@/repository/cf-ip-blacklist";
import { logger } from "@/lib/logger";

// 优选 IP 缓存（域名 -> IP 列表）
let optimizedIpCache: Map<string, string[]> = new Map();
let lastCacheUpdate = 0;
const CACHE_TTL = 60000; // 1 分钟缓存

/**
 * 加载优选 IP 配置到缓存
 */
async function loadOptimizedIps(): Promise<void> {
  try {
    const domains = await getActiveCfOptimizedDomains();

    const newCache = new Map<string, string[]>();
    for (const domain of domains) {
      if (domain.optimizedIps.length > 0) {
        newCache.set(domain.domain, domain.optimizedIps);
      }
    }

    optimizedIpCache = newCache;
    lastCacheUpdate = Date.now();

    logger.info("[CfOptimizedIpResolver] Loaded optimized IPs", {
      domainsCount: newCache.size,
    });
  } catch (error) {
    logger.error("[CfOptimizedIpResolver] Failed to load optimized IPs:", error);
  }
}

/**
 * 获取域名的优选 IP（带缓存）
 */
export async function getOptimizedIp(domain: string): Promise<string | null> {
  // 检查缓存是否过期
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await loadOptimizedIps();
  }

  const ips = optimizedIpCache.get(domain);
  if (!ips || ips.length === 0) {
    return null;
  }

  // 获取黑名单 IP（失败次数 >= 3）
  const blacklistedIps = await getBlacklistedIps(domain, 3);

  // 过滤掉黑名单中的 IP
  const availableIps = ips.filter((ip) => !blacklistedIps.includes(ip));

  if (availableIps.length === 0) {
    logger.warn("[CfOptimizedIpResolver] All IPs are blacklisted", {
      domain,
      totalIps: ips.length,
      blacklistedCount: blacklistedIps.length,
    });
    return null;
  }

  // 随机选择一个可用 IP（负载均衡）
  const randomIndex = Math.floor(Math.random() * availableIps.length);
  return availableIps[randomIndex];
}

/**
 * 创建自定义 DNS lookup 函数（用于 Node.js fetch）
 * 如果域名有配置优选 IP，则使用优选 IP；否则使用默认 DNS
 */
export async function createOptimizedLookup(targetDomain: string) {
  const optimizedIp = await getOptimizedIp(targetDomain);

  if (!optimizedIp) {
    // 没有配置优选 IP，返回 undefined 使用默认 DNS
    return undefined;
  }

  logger.debug("[CfOptimizedIpResolver] Using optimized IP", {
    domain: targetDomain,
    ip: optimizedIp,
  });

  // 返回自定义 lookup 函数
  return (hostname: string, options: any, callback: any) => {
    if (hostname === targetDomain) {
      // 使用优选 IP
      callback(null, optimizedIp, 4); // 4 表示 IPv4
    } else {
      // 其他域名使用默认 DNS
      require("dns").lookup(hostname, options, callback);
    }
  };
}

/**
 * 手动刷新缓存
 */
export async function refreshCache(): Promise<void> {
  await loadOptimizedIps();
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  return {
    domainsCount: optimizedIpCache.size,
    lastUpdate: new Date(lastCacheUpdate),
    cacheAge: Date.now() - lastCacheUpdate,
  };
}
