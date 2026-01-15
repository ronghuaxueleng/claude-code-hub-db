"use server";

import { testProviderSpeed } from "@/lib/provider-speed-test";

export interface CfIpTestResult {
  ip: string;
  avgLatency: number;
  successRate: number;
}

/**
 * 测试 Cloudflare IP 速度
 * @param domain 要测试的域名
 * @param testCount 每个 IP 测试次数
 * @returns 测试结果，按平均延迟排序
 */
export async function testCfOptimizedIps(domain: string, testCount = 3): Promise<CfIpTestResult[]> {
  // Cloudflare 常用 IP 段
  const cfIpRanges = [
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/12",
  ];

  // 从每个 IP 段随机选择一些 IP 进行测试
  const testIps: string[] = [];
  for (const range of cfIpRanges.slice(0, 5)) {
    // 只测试前 5 个段
    const [baseIp, cidr] = range.split("/");
    const [a, b, c, d] = baseIp.split(".").map(Number);

    // 从每个段随机选择 2 个 IP
    for (let i = 0; i < 2; i++) {
      const randomOffset = Math.floor(Math.random() * 256);
      const testIp = `${a}.${b}.${c}.${(d + randomOffset) % 256}`;
      testIps.push(testIp);
    }
  }

  // 测试每个 IP
  const results: CfIpTestResult[] = [];

  for (const ip of testIps) {
    try {
      const result = await testProviderSpeed({
        baseURL: `https://${domain}`,
        headers: {
          Host: domain,
        },
        timeout: 5000,
        testCount,
        customIp: ip,
      });

      if (result.avgLatency > 0) {
        results.push({
          ip,
          avgLatency: result.avgLatency,
          successRate: result.successRate,
        });
      }
    } catch (error) {
      console.error(`Failed to test IP ${ip}:`, error);
    }
  }

  // 按平均延迟排序，只返回成功率 > 50% 的 IP
  return results
    .filter((r) => r.successRate > 0.5)
    .sort((a, b) => a.avgLatency - b.avgLatency)
    .slice(0, 5); // 只返回前 5 个最快的
}
