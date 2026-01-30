"use server";

import dns from "node:dns/promises";
import { connect as tlsConnect } from "node:tls";
import { Agent, request } from "undici";
import { getBlacklistedIps, recordIpFailure } from "@/repository/cf-ip-blacklist";

export interface CfIpTestResult {
  ip: string;
  avgLatency: number;
  successRate: number;
  // 新增字段：原始延迟对比
  originalIp?: string;
  originalLatency?: number;
  improvement?: number; // 加速百分比 (正数表示加速，负数表示减速)
}

// 并发限制
const CONCURRENCY_LIMIT = 10;

// IP 源配置
const IP_SOURCES = {
  // 首选：IPDB API（实时优选）
  ipdb: "https://ipdb.api.030101.xyz/?type=bestcf",
  // 备选：GitHub 静态列表
  github:
    "https://gh-proxy.org/https://raw.githubusercontent.com/DuanFeiX/CFIP/refs/heads/main/ip.txt",
};

// 回退 IP 列表
const FALLBACK_IPS = [
  "104.16.132.229",
  "104.16.133.229",
  "172.67.177.54",
  "172.67.178.54",
  "104.21.48.200",
  "104.21.49.200",
  "172.64.155.89",
  "172.64.156.89",
  "104.18.32.167",
  "104.18.33.167",
  "104.22.64.196",
  "104.22.65.196",
  "172.66.40.112",
  "172.66.41.112",
  "104.17.96.13",
  "104.17.97.13",
  "104.19.128.15",
  "104.19.129.15",
  "172.65.32.10",
  "172.65.33.10",
];

/**
 * 创建用于测试特定 IP 的 Agent
 */
function createTestAgent(domain: string, ip: string): Agent {
  // 创建自定义 connect 函数，将域名解析到指定 IP
  const customConnect = (opts: any, callback: any) => {
    // 如果是目标域名，使用指定 IP
    if (opts.hostname === domain || opts.servername === domain) {
      // 使用 Node.js 原生 tls 模块创建连接
      const socket = tlsConnect({
        host: ip, // 连接到指定 IP
        port: opts.port || 443,
        servername: domain, // SNI 使用原域名
        rejectUnauthorized: true,
      });

      // 处理连接事件
      socket.once("secureConnect", () => {
        callback(null, socket);
      });

      socket.once("error", (err) => {
        callback(err, null);
      });

      return socket;
    }

    // 其他域名使用默认连接（不应该发生）
    const socket = tlsConnect({
      host: opts.hostname,
      port: opts.port || 443,
      servername: opts.servername || opts.hostname,
      rejectUnauthorized: true,
    });

    socket.once("secureConnect", () => {
      callback(null, socket);
    });

    socket.once("error", (err) => {
      callback(err, null);
    });

    return socket;
  };

  return new Agent({
    connect: customConnect,
  });
}

/**
 * 测试单个 IP 访问指定域名的延迟
 */
async function testSingleIp(
  domain: string,
  ip: string,
  timeout = 5000
): Promise<{ success: boolean; latency: number; error?: Error }> {
  const startTime = Date.now();

  try {
    // 创建专门用于测试这个 IP 的 Agent
    const agent = createTestAgent(domain, ip);

    // 使用域名作为 URL，但通过 Agent 连接到指定 IP
    const response = await request(`https://${domain}/`, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      headersTimeout: timeout,
      bodyTimeout: timeout,
      dispatcher: agent,
    });

    const latency = Date.now() - startTime;

    // 关闭 Agent
    await agent.close();

    // 只要能连接就算成功（即使返回 4xx/5xx）
    const success = response.statusCode < 600;
    console.log(
      `[CF IP Test] ${ip} -> ${domain}: ${success ? "SUCCESS" : "FAIL"} (${response.statusCode}, ${latency}ms)`
    );

    return {
      success,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[CF IP Test] ${ip} -> ${domain}: ERROR`, error);
    return {
      success: false,
      latency: latency > timeout ? timeout : latency,
      error: err,
    };
  }
}

/**
 * 解析 IP 列表文本
 */
function parseIpList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && /^\d+\.\d+\.\d+\.\d+$/.test(line));
}

/**
 * 从多个源获取 IP 列表（优先使用 IPDB API）
 */
async function fetchIpList(): Promise<string[]> {
  // 1. 先尝试 IPDB API（实时优选）
  try {
    const response = await fetch(IP_SOURCES.ipdb, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const text = await response.text();
      const ips = parseIpList(text);
      if (ips.length > 0) {
        console.log(`[CF IP Test] Fetched ${ips.length} IPs from IPDB API`);
        return ips;
      }
    }
  } catch (e) {
    console.warn("[CF IP Test] IPDB API failed, trying GitHub:", e);
  }

  // 2. 回退到 GitHub 静态列表
  try {
    const response = await fetch(IP_SOURCES.github, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const text = await response.text();
      const ips = parseIpList(text);
      if (ips.length > 0) {
        console.log(`[CF IP Test] Fetched ${ips.length} IPs from GitHub`);
        return ips;
      }
    }
  } catch (e) {
    console.warn("[CF IP Test] GitHub failed, using fallback:", e);
  }

  // 3. 最终回退到硬编码列表
  console.log(`[CF IP Test] Using ${FALLBACK_IPS.length} fallback IPs`);
  return FALLBACK_IPS;
}

/**
 * DNS 解析域名获取原始 IP
 */
async function resolveDns(domain: string): Promise<string | null> {
  try {
    const addresses = await dns.resolve4(domain);
    if (addresses.length > 0) {
      console.log(`[CF IP Test] Resolved ${domain} to ${addresses[0]}`);
      return addresses[0];
    }
  } catch (e) {
    console.warn(`[CF IP Test] DNS resolution failed for ${domain}:`, e);
  }
  return null;
}

/**
 * 并发测试多个 IP
 */
async function testIpsConcurrently(
  domain: string,
  ips: string[],
  timeout: number,
  testCount: number
): Promise<{ results: CfIpTestResult[]; failedIps: Array<{ ip: string; error: Error }> }> {
  const results: CfIpTestResult[] = [];
  const failedIps: Array<{ ip: string; error: Error }> = [];

  // 分批并发测试
  for (let i = 0; i < ips.length; i += CONCURRENCY_LIMIT) {
    const batch = ips.slice(i, i + CONCURRENCY_LIMIT);
    const batchNum = Math.floor(i / CONCURRENCY_LIMIT) + 1;
    const totalBatches = Math.ceil(ips.length / CONCURRENCY_LIMIT);
    console.log(
      `[CF IP Test] Testing batch ${batchNum}/${totalBatches} (${batch.length} IPs concurrently)`
    );

    const batchPromises = batch.map(async (ip) => {
      const testResults: boolean[] = [];
      const latencies: number[] = [];
      let lastError: Error | null = null;

      // 对每个 IP 进行多次测试
      for (let t = 0; t < testCount; t++) {
        const result = await testSingleIp(domain, ip, timeout);
        testResults.push(result.success);
        if (result.success) {
          latencies.push(result.latency);
        } else if (result.error) {
          lastError = result.error;
        }
      }

      const successCount = testResults.filter((r) => r).length;
      const successRate = successCount / testCount;
      const avgLatency =
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 9999;

      return { ip, successRate, avgLatency, lastError };
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        const { ip, successRate, avgLatency, lastError } = result.value;

        if (successRate > 0) {
          results.push({
            ip,
            avgLatency,
            successRate,
          });
          console.log(`[CF IP Test] ${ip}: SUCCESS, avgLatency=${avgLatency.toFixed(0)}ms`);
        } else if (lastError) {
          failedIps.push({ ip, error: lastError });
          console.log(`[CF IP Test] ${ip}: FAIL, error=${lastError.message}`);
        }
      }
    }
  }

  return { results, failedIps };
}

/**
 * 测试 Cloudflare IP 访问指定域名的速度
 * @param domain 要测试的域名（如 api.anthropic.com）
 * @param testCount 每个 IP 测试次数（默认 1 次）
 * @returns 测试结果，按平均延迟排序
 */
export async function testCfOptimizedIps(domain: string, testCount = 1): Promise<CfIpTestResult[]> {
  const startTime = Date.now();
  console.log(`[CF IP Test] Starting test for domain: ${domain}, testCount: ${testCount}`);

  // 1. 先测原始 IP（DNS 解析）
  const originalIp = await resolveDns(domain);
  let originalLatency: number | null = null;

  if (originalIp) {
    console.log(`[CF IP Test] Testing original IP: ${originalIp}`);
    const originalResult = await testSingleIp(domain, originalIp, 3000);
    if (originalResult.success) {
      originalLatency = originalResult.latency;
      console.log(`[CF IP Test] Original IP latency: ${originalLatency}ms`);
    } else {
      console.log(`[CF IP Test] Original IP test failed`);
    }
  }

  // 2. 查询黑名单 IP（失败次数 >= 3）
  const blacklistedIps = await getBlacklistedIps(domain, 3);
  if (blacklistedIps.length > 0) {
    console.log(`[CF IP Test] Found ${blacklistedIps.length} blacklisted IPs, will skip them`);
  }

  // 3. 从多个源获取 IP 列表
  const candidateIps = await fetchIpList();

  // 4. 过滤黑名单
  const ipsToTest = candidateIps.filter((ip) => !blacklistedIps.includes(ip));
  console.log(`[CF IP Test] Testing ${ipsToTest.length} IPs (${candidateIps.length - ipsToTest.length} blacklisted)`);

  // 5. 并发测速
  const { results, failedIps } = await testIpsConcurrently(domain, ipsToTest, 3000, testCount);

  // 6. 记录失败的 IP 到黑名单
  for (const { ip, error } of failedIps) {
    const errorType = error.name || "UNKNOWN_ERROR";
    const errorMessage = error.message || String(error);
    await recordIpFailure(domain, ip, errorType, errorMessage);
  }

  // 7. 计算加速效果
  if (originalLatency && originalIp) {
    for (const result of results) {
      result.originalIp = originalIp;
      result.originalLatency = originalLatency;
      result.improvement = Math.round(((originalLatency - result.avgLatency) / originalLatency) * 100);
    }
  }

  // 8. 按平均延迟排序，返回前 5 个
  const sorted = results.sort((a, b) => a.avgLatency - b.avgLatency).slice(0, 5);

  const totalTime = Date.now() - startTime;
  console.log(`[CF IP Test] Completed in ${totalTime}ms, found ${results.length} successful IPs`);

  // 输出加速效果日志
  if (sorted.length > 0 && originalLatency) {
    console.log(`[CF IP Test] Top results (original: ${originalLatency}ms):`);
    for (const result of sorted) {
      const sign = (result.improvement ?? 0) >= 0 ? "+" : "";
      console.log(
        `  ${result.ip}: ${result.avgLatency.toFixed(0)}ms (${sign}${result.improvement}% faster)`
      );
    }
  }

  return sorted;
}
