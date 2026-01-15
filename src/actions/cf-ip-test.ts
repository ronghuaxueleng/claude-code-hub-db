"use server";

import { Agent, request } from "undici";

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
  const customConnect = (opts: any, callback: any) => {
    // 如果是目标域名，使用指定 IP
    if (opts.hostname === domain || opts.servername === domain) {
      const modifiedOpts = {
        ...opts,
        hostname: ip, // 连接到指定 IP
        servername: domain, // 保持 SNI 为原域名（用于 TLS）
      };
      return Agent.prototype.connect.call(this, modifiedOpts, callback);
    }
    return Agent.prototype.connect.call(this, opts, callback);
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
  timeout = 5000,
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
    return {
      success: response.statusCode < 600,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      latency: latency > timeout ? timeout : latency,
    };
  }
}

/**
 * 测试 Cloudflare IP 访问指定域名的速度
 * @param domain 要测试的域名（如 api.anthropic.com）
 * @param testCount 每个 IP 测试次数
 * @returns 测试结果，按平均延迟排序
 */
export async function testCfOptimizedIps(
  domain: string,
  testCount = 3,
): Promise<CfIpTestResult[]> {
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
  for (const ip of commonCfIps) {
    const testResults: boolean[] = [];
    const latencies: number[] = [];

    // 对每个 IP 进行多次测试
    for (let i = 0; i < testCount; i++) {
      const result = await testSingleIp(domain, ip, 5000);
      testResults.push(result.success);
      if (result.success) {
        latencies.push(result.latency);
      }
    }

    // 计算成功率和平均延迟
    const successRate = testResults.filter((r) => r).length / testCount;
    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 9999;

    if (successRate > 0) {
      results.push({
        ip,
        avgLatency,
        successRate,
      });
    }
  }

  // 按平均延迟排序，只返回成功率 > 50% 的 IP
  return results
    .filter((r) => r.successRate > 0.5)
    .sort((a, b) => a.avgLatency - b.avgLatency)
    .slice(0, 5); // 只返回前 5 个最快的
}
