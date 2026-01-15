import postgres from 'postgres';
import { config } from 'dotenv';

// 加载环境变量
config();

const sql = postgres(process.env.DSN);

async function main() {
  console.log('=== CF 优选域名配置 ===');
  const domains = await sql`
    SELECT domain, optimized_ips, is_enabled
    FROM cf_optimized_domains
    ORDER BY domain
  `;

  for (const domain of domains) {
    console.log(`\n域名: ${domain.domain} (${domain.is_enabled ? '启用' : '禁用'})`);
    console.log(`配置的 IP: ${domain.optimized_ips.join(', ')}`);
  }

  console.log('\n\n=== CF IP 黑名单 ===');
  const blacklist = await sql`
    SELECT domain, ip, failure_count, last_error_type, last_failure_at
    FROM cf_ip_blacklist
    ORDER BY failure_count DESC, last_failure_at DESC
  `;

  if (blacklist.length === 0) {
    console.log('黑名单为空');
  } else {
    console.log(`共 ${blacklist.length} 条记录:\n`);
    for (const entry of blacklist) {
      console.log(`IP: ${entry.ip}`);
      console.log(`  域名: ${entry.domain}`);
      console.log(`  失败次数: ${entry.failure_count}`);
      console.log(`  错误类型: ${entry.last_error_type || 'N/A'}`);
      console.log(`  最后失败: ${entry.last_failure_at}`);
      console.log('');
    }
  }

  await sql.end();
}

main().catch(console.error);
