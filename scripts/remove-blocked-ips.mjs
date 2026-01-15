import postgres from 'postgres';
import { config } from 'dotenv';

// 加载环境变量
config();

const sql = postgres(process.env.DSN);

async function main() {
  const domain = 'cc.rhxl.de5.net';

  // 被限制的 IP 列表（返回 403）
  const blockedIps = [
    '104.16.132.229',
    '104.16.133.229',
  ];

  console.log(`正在从域名 ${domain} 的配置中移除被限制的 IP...`);
  console.log(`被限制的 IP: ${blockedIps.join(', ')}\n`);

  // 获取当前配置
  const [currentConfig] = await sql`
    SELECT id, optimized_ips
    FROM cf_optimized_domains
    WHERE domain = ${domain}
  `;

  if (!currentConfig) {
    console.log(`错误：未找到域名 ${domain} 的配置`);
    await sql.end();
    return;
  }

  console.log(`当前配置的 IP: ${currentConfig.optimized_ips.join(', ')}`);

  // 过滤掉被限制的 IP
  const newIps = currentConfig.optimized_ips.filter(
    (ip) => !blockedIps.includes(ip)
  );

  console.log(`过滤后的 IP: ${newIps.join(', ')}`);
  console.log(`移除了 ${currentConfig.optimized_ips.length - newIps.length} 个 IP\n`);

  if (newIps.length === 0) {
    console.log('警告：过滤后没有可用的 IP！');
    await sql.end();
    return;
  }

  // 更新数据库
  await sql`
    UPDATE cf_optimized_domains
    SET optimized_ips = ${newIps},
        updated_at = NOW()
    WHERE id = ${currentConfig.id}
  `;

  console.log('✓ 数据库已更新');

  // 同时将这些 IP 加入黑名单（设置失败次数为 3，确保被跳过）
  for (const ip of blockedIps) {
    await sql`
      INSERT INTO cf_ip_blacklist (domain, ip, failure_count, last_error_type, last_error_message)
      VALUES (${domain}, ${ip}, 3, 'HTTP_403', 'Edge IP Restricted by Cloudflare')
      ON CONFLICT (domain, ip)
      DO UPDATE SET
        failure_count = 3,
        last_error_type = 'HTTP_403',
        last_error_message = 'Edge IP Restricted by Cloudflare',
        last_failure_at = NOW(),
        updated_at = NOW()
    `;
    console.log(`✓ IP ${ip} 已加入黑名单`);
  }

  await sql.end();
  console.log('\n完成！');
}

main().catch(console.error);
