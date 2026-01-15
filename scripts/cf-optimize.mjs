#!/usr/bin/env node

/**
 * Cloudflare IP 优选自动化脚本
 * 功能：下载测速工具、执行测速、保存结果
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TOOL_DIR = './tools/cf-speedtest';
const RESULT_FILE = './config/cf-optimized-ips.json';

// 颜色输出
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// 检测操作系统
function detectOS() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'linux') {
    return arch === 'x64' ? 'linux_amd64' : 'linux_arm64';
  } else if (platform === 'darwin') {
    return arch === 'x64' ? 'darwin_amd64' : 'darwin_arm64';
  } else if (platform === 'win32') {
    return 'windows_amd64';
  }

  throw new Error(`不支持的操作系统: ${platform} ${arch}`);
}

// 下载测速工具
function downloadTool() {
  log('\n📦 下载 CloudflareSpeedTest 工具...', 'cyan');

  if (!existsSync(TOOL_DIR)) {
    mkdirSync(TOOL_DIR, { recursive: true });
  }

  const os = detectOS();
  const version = 'v2.2.5';
  const ext = os.includes('windows') ? 'zip' : 'tar.gz';
  const filename = `CloudflareST_${os}.${ext}`;
  const url = `https://github.com/XIU2/CloudflareSpeedTest/releases/download/${version}/${filename}`;

  log(`下载地址: ${url}`, 'yellow');

  try {
    execSync(`curl -L -o ${TOOL_DIR}/${filename} ${url}`, { stdio: 'inherit' });

    // 解压
    if (ext === 'tar.gz') {
      execSync(`tar -xzf ${TOOL_DIR}/${filename} -C ${TOOL_DIR}`, { stdio: 'inherit' });
    } else {
      execSync(`unzip -o ${TOOL_DIR}/${filename} -d ${TOOL_DIR}`, { stdio: 'inherit' });
    }

    log('✅ 工具下载完成', 'green');
  } catch (error) {
    log('❌ 下载失败，请手动下载', 'red');
    log(`手动下载地址: ${url}`, 'yellow');
    throw error;
  }
}

// 执行测速
function runSpeedTest() {
  log('\n🚀 开始测速（预计需要 2-5 分钟）...', 'cyan');

  const executable = process.platform === 'win32' ? 'CloudflareST.exe' : './CloudflareST';
  const toolPath = join(TOOL_DIR, executable);

  if (!existsSync(toolPath)) {
    log('❌ 测速工具不存在，请先下载', 'red');
    return false;
  }

  try {
    // 添加执行权限（Linux/macOS）
    if (process.platform !== 'win32') {
      execSync(`chmod +x ${toolPath}`);
    }

    // 执行测速
    execSync(`cd ${TOOL_DIR} && ${executable} -n 200 -t 4 -sl 5`, {
      stdio: 'inherit',
    });

    log('✅ 测速完成', 'green');
    return true;
  } catch (error) {
    log('❌ 测速失败', 'red');
    return false;
  }
}

// 解析测速结果
function parseResults() {
  log('\n📊 解析测速结果...', 'cyan');

  const resultPath = join(TOOL_DIR, 'result.csv');

  if (!existsSync(resultPath)) {
    log('❌ 未找到测速结果文件', 'red');
    return null;
  }

  const content = readFileSync(resultPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    log('❌ 测速结果为空', 'red');
    return null;
  }

  // 跳过表头，解析数据
  const ips = [];
  for (let i = 1; i < Math.min(lines.length, 11); i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 6) {
      ips.push({
        ip: parts[0],
        latency: parseFloat(parts[4]),
        speed: parts[5],
      });
    }
  }

  log(`✅ 找到 ${ips.length} 个优选 IP`, 'green');
  return ips;
}

// 保存结果
function saveResults(ips) {
  log('\n💾 保存优选结果...', 'cyan');

  const configDir = './config';
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const result = {
    updateTime: new Date().toISOString(),
    ips: ips.map(item => item.ip),
    details: ips,
  };

  writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));

  log(`✅ 结果已保存到: ${RESULT_FILE}`, 'green');
  log('\n📋 优选 IP 列表:', 'cyan');
  ips.forEach((item, index) => {
    log(`  ${index + 1}. ${item.ip} (延迟: ${item.latency}ms, 速度: ${item.speed})`, 'yellow');
  });
}

// 主函数
async function main() {
  log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║       Cloudflare IP 优选工具                              ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  try {
    // 1. 检查工具是否存在
    const toolExists = existsSync(join(TOOL_DIR, process.platform === 'win32' ? 'CloudflareST.exe' : 'CloudflareST'));

    if (!toolExists) {
      downloadTool();
    } else {
      log('✅ 测速工具已存在', 'green');
    }

    // 2. 执行测速
    const success = runSpeedTest();
    if (!success) {
      process.exit(1);
    }

    // 3. 解析结果
    const ips = parseResults();
    if (!ips || ips.length === 0) {
      log('❌ 未获取到有效的优选 IP', 'red');
      process.exit(1);
    }

    // 4. 保存结果
    saveResults(ips);

    log('\n🎉 优选完成！', 'green');
    log('\n💡 使用建议:', 'cyan');
    log('  1. 将优选 IP 添加到 hosts 文件', 'yellow');
    log('  2. 或在代码中使用 cf-optimized-ips.json', 'yellow');
    log('  3. 建议每周重新测速一次', 'yellow');
  } catch (error) {
    log(`\n❌ 发生错误: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
