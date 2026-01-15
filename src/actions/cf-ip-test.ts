"use server";

import { Agent, request } from "undici";
import { connect as tlsConnect } from "node:tls";

export interface CfIpTestResult {
  ip: string;
  avgLatency: number;
  successRate: number;
}

/**
 * 创建用于测试特定 IP 的 Agent
 */
function createTestAgent(domain: string, ip: string): Agent {
  // 创建自定义 connect 函数，将域名解析到指定 IP
  const customConnect = function (opts: any, callback: any) {
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
): Promise<{ success: boolean; latency: number }> {
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
    console.log(`[CF IP Test] ${ip} -> ${domain}: ${success ? "SUCCESS" : "FAIL"} (${response.statusCode}, ${latency}ms)`);

    return {
      success,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`[CF IP Test] ${ip} -> ${domain}: ERROR`, error);
    return {
      success: false,
      latency: latency > timeout ? timeout : latency,
    };
  }
}

/**
 * 测试 Cloudflare IP 访问指定域名的速度
 * @param domain 要测试的域名（如 api.anthropic.com）
 * @param testCount 每个 IP 测试次数（默认 1 次）
 * @returns 测试结果，按平均延迟排序
 */
export async function testCfOptimizedIps(
  domain: string,
  testCount = 1,
): Promise<CfIpTestResult[]> {
  console.log(`[CF IP Test] Starting test for domain: ${domain}, testCount: ${testCount}`);

  // Cloudflare 常用 Anycast IP 列表
  const commonCfIps = [
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

  const results: CfIpTestResult[] = [];

  // 串行测试每个 IP（避免并发过多）
  for (let ipIndex = 0; ipIndex < commonCfIps.length; ipIndex++) {
    const ip = commonCfIps[ipIndex];
    console.log(`[CF IP Test] Testing ${ipIndex + 1}/${commonCfIps.length}: ${ip}`);

    const testResults: boolean[] = [];
    const latencies: number[] = [];

    // 对每个 IP 进行测试
    for (let i = 0; i < testCount; i++) {
      const result = await testSingleIp(domain, ip, 3000);
      testResults.push(result.success);
      if (result.success) {
        latencies.push(result.latency);
      }
    }

    // 计算成功率和平均延迟
    const successCount = testResults.filter((r) => r).length;
    const successRate = successCount / testCount;
    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 9999;

    console.log(
      `[CF IP Test] ${ip}: ${successCount > 0 ? "SUCCESS" : "FAIL"}, avgLatency=${avgLatency}ms`
    );

    if (successRate > 0) {
      results.push({
        ip,
        avgLatency,
        successRate,
      });
    }
  }

  console.log(`[CF IP Test] Total successful IPs: ${results.length}`);

  // 按平均延迟排序
  const sorted = results.sort((a, b) => a.avgLatency - b.avgLatency).slice(0, 5);

  console.log(`[CF IP Test] Returning top ${sorted.length} IPs`);

  return sorted;
}
