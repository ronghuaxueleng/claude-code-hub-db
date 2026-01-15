/**
 * Cloudflare IP 优选配置示例
 *
 * 使用方法：
 * 1. 运行 CloudflareSpeedTest 获取优选 IP
 * 2. 将最快的 IP 填入 OPTIMIZED_IPS 数组
 * 3. 在需要的地方引入此配置
 */

// 优选的 Cloudflare IP 列表（按速度排序）
export const OPTIMIZED_IPS = [
  '104.21.48.123',    // 示例 IP，请替换为实际测速结果
  '172.67.189.45',
  '104.16.132.229',
];

// 获取随机优选 IP（负载均衡）
export function getOptimizedIP() {
  return OPTIMIZED_IPS[Math.floor(Math.random() * OPTIMIZED_IPS.length)];
}

// 获取最快的 IP（第一个）
export function getFastestIP() {
  return OPTIMIZED_IPS[0];
}

// 创建自定义 DNS 解析器（用于 Node.js fetch）
export function createOptimizedLookup(targetDomain) {
  return (hostname, options, callback) => {
    // 如果是目标域名，使用优选 IP
    if (hostname === targetDomain) {
      const ip = getFastestIP();
      console.log(`[CF优选] ${hostname} -> ${ip}`);
      callback(null, ip, 4); // 4 表示 IPv4
    } else {
      // 其他域名使用默认 DNS
      require('dns').lookup(hostname, options, callback);
    }
  };
}

// 使用示例
export function exampleUsage() {
  const https = require('https');
  const { Agent } = https;

  // 创建使用优选 IP 的 Agent
  const agent = new Agent({
    lookup: createOptimizedLookup('api.example.com'),
  });

  // 在 fetch 中使用
  fetch('https://api.example.com/v1/messages', {
    agent,
    headers: {
      'Host': 'api.example.com', // 重要：保持正确的 Host 头
    },
  });
}
