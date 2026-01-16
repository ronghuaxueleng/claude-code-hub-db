/**
 * Cloudflare 优选 IP 解析器
 * 用于在代理请求时自动使用配置的优选 IP
 */

import { getActiveCfOptimizedDomains } from "@/repository/cf-optimized-domains";
import { getBlacklistedIps } from "@/repository/cf-ip-blacklist";
import { getSystemSettings } from "@/repository/system-config";
import { logger } from "@/lib/logger";

// 优选 IP 缓存（域名 -> IP 列表）
let optimizedIpCache: Map<string, string[]> = new Map();
let lastCacheUpdate = 0;
let isGloballyEnabled = false; // 全局启用状态缓存
const CACHE_TTL = 60000; // 1 分钟缓存

/**
 * 检查域名是否匹配（支持精确匹配和子域名匹配）
 */
function isDomainMatch(hostname: string, targetDomain: string): boolean {
  // 精确匹配
  if (hostname === targetDomain) {
    return true;
  }
  // 子域名匹配（如 api.claude.ai 匹配 claude.ai）
  if (hostname.endsWith(`.${targetDomain}`)) {
    return true;
  }
  return false;
}

/**
 * 检查域名是否应该使用优选 IP
 */
function shouldOptimize(hostname: string): boolean {
  // 1. 检查全局开关
  if (!isGloballyEnabled) {
    return false;
  }

  // 2. 检查是否在配置的域名列表中
  for (const domain of optimizedIpCache.keys()) {
    if (isDomainMatch(hostname, domain)) {
      return true;
    }
  }

  return false;
}

/**
 * 加载优选 IP 配置到缓存
 */
async function loadOptimizedIps(): Promise<void> {
  try {
    // 获取全局启用状态
    const systemSettings = await getSystemSettings();
    isGloballyEnabled = systemSettings.enableCfOptimization;

    if (!isGloballyEnabled) {
      logger.info("[CfOptimizedIpResolver] CF 优选功能已全局禁用");
      optimizedIpCache.clear();
      lastCacheUpdate = Date.now();
      return;
    }

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
      globallyEnabled: isGloballyEnabled,
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

  // 检查是否应该优化该域名
  if (!shouldOptimize(domain)) {
    return null;
  }

  // 查找匹配的域名配置（支持精确匹配和子域名匹配）
  let ips: string[] | undefined;
  for (const [cachedDomain, cachedIps] of optimizedIpCache.entries()) {
    if (isDomainMatch(domain, cachedDomain)) {
      ips = cachedIps;
      break;
    }
  }

  if (!ips || ips.length === 0) {
    return null;
  }

  // 获取黑名单 IP（失败次数 >= 3）
  const blacklistedIps = await getBlacklistedIps(domain, 3);

  // 过滤掉黑名单中的 IP
  const availableIps = ips.filter((ip) => !blacklistedIps.includes(ip));

  if (availableIps.length === 0) {
    logger.warn("[CfOptimizedIpResolver] All IPs are blacklisted, falling back to default DNS", {
      domain,
      totalIps: ips.length,
      blacklistedCount: blacklistedIps.length,
    });
    return null; // 返回 null，回退到默认 DNS
  }

  // 随机选择一个可用 IP（负载均衡）
  const randomIndex = Math.floor(Math.random() * availableIps.length);
  const selectedIp = availableIps[randomIndex];

  logger.debug("[CfOptimizedIpResolver] Selected optimized IP", {
    domain,
    ip: selectedIp,
    availableCount: availableIps.length,
  });

  return selectedIp;
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
