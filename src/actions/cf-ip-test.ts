"use server";

export interface CfIpTestResult {
  ip: string;
  avgLatency: number;
  successRate: number;
}

/**
 * 测试单个 IP 的连通性和延迟
 */
async function testSingleIp(
  domain: string,
  ip: string,
  timeout = 5000
): Promise<{ success: boolean; latency: number }> {
  const startTime = Date.now();

  try {
    // 使用简单的 HTTPS 请求测试连通性
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 测试 HTTPS 连接
    const response = await fetch(`https://${domain}/`, {
      method: "HEAD",
      headers: {
        Host: domain,
      },
      signal: controller.signal,
      // @ts-ignore - Node.js fetch 支持自定义 DNS
      dispatcher: undefined, // 在浏览器环境中会被忽略
    });

    clearTimeout(timeoutId);

    const latency = Date.now() - startTime;

    // 只要能连接就算成功（即使返回 4xx/5xx）
    return {
      success: response.status < 600,
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
 * 测试 Cloudflare IP 速度
 * @param domain 要测试的域名
 * @param testCount 每个 IP 测试次数
 * @returns 测试结果，按平均延迟排序
 */
export async function testCfOptimizedIps(domain: string, testCount = 3): Promise<CfIpTestResult[]> {
  // Cloudflare 常用 IP 列表（这些是已知的 Cloudflare Anycast IP）
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
  ];

  const results: CfIpTestResult[] = [];

  // 测试每个 IP
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
