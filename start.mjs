#!/usr/bin/env node

/**
 * Claude Code Hub 启动脚本
 *
 * 功能：
 * - 环境变量检查和加载
 * - 平台依赖检查（Windows/Linux/macOS）
 * - 数据库连接检查
 * - 自动数据库迁移
 * - 启动 Next.js 应用
 * - 优雅关闭处理
 */

import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 检测当前平台
const isWindows = platform() === "win32";

// 修复 Windows 控制台中文乱码问题
if (isWindows) {
  try {
    // 设置控制台代码页为 UTF-8 (65001)
    execSync("chcp 65001 >nul 2>&1", { stdio: "pipe" });
  } catch (_error) {
    // 忽略错误，继续执行
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const options = {
  dev: args.includes("--dev") || args.includes("-d"),
  skipInstall: args.includes("--skip-install") || args.includes("--quick") || args.includes("-q"),
  skipBuild:
    args.includes("--skip-build") ||
    args.includes("--quick") ||
    args.includes("-q") ||
    args.includes("--dev") ||
    args.includes("-d"),
  skipMigration: args.includes("--skip-migration"),
  quick: args.includes("--quick") || args.includes("-q"),
  help: args.includes("--help") || args.includes("-h"),
  cleanCache: args.includes("--clean-cache") || args.includes("--clean"),
  enableSourceMaps: args.includes("--enable-sourcemaps"),
};

// ANSI 颜色代码
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

// 日志函数
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.bright}▸${colors.reset} ${msg}`),
};

// 显示帮助信息
function showHelp() {
  console.log("");
  console.log(`${colors.bright}${colors.cyan}Claude Code Hub 启动脚本${colors.reset}`);
  console.log("");
  console.log(`${colors.bright}用法:${colors.reset}`);
  console.log(`  node start.mjs [选项]`);
  console.log("");
  console.log(`${colors.bright}选项:${colors.reset}`);
  console.log(
    `  ${colors.green}-d, --dev${colors.reset}          开发模式启动（跳过构建，使用 next dev）`
  );
  console.log(`  ${colors.green}-q, --quick${colors.reset}        快速启动（跳过依赖和构建）`);
  console.log(`  ${colors.green}--skip-install${colors.reset}     跳过依赖检查和安装`);
  console.log(`  ${colors.green}--skip-build${colors.reset}       跳过应用构建步骤`);
  console.log(`  ${colors.green}--skip-migration${colors.reset}   跳过数据库迁移`);
  console.log(
    `  ${colors.green}--clean-cache${colors.reset}      清理构建缓存（强制完整重新构建）`
  );
  console.log(
    `  ${colors.green}--enable-sourcemaps${colors.reset} 启用 Source Maps（调试用，会增加构建时间）`
  );
  console.log(`  ${colors.green}-h, --help${colors.reset}         显示此帮助信息`);
  console.log("");
  console.log(`${colors.bright}示例:${colors.reset}`);
  console.log(`  ${colors.gray}# 完整启动（包含所有检查）${colors.reset}`);
  console.log(`  node start.mjs`);
  console.log("");
  console.log(`  ${colors.gray}# 开发模式（推荐日常开发使用）${colors.reset}`);
  console.log(`  node start.mjs -d`);
  console.log("");
  console.log(`  ${colors.gray}# 快速启动（生产模式，跳过依赖和构建）${colors.reset}`);
  console.log(`  node start.mjs -q`);
  console.log("");
  console.log(`  ${colors.gray}# 跳过构建但执行迁移${colors.reset}`);
  console.log(`  node start.mjs --skip-build`);
  console.log("");
}

// 加载环境变量
async function loadEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) {
    log.warn("未找到 .env 文件，将使用默认配置");
    return;
  }

  try {
    const { config } = await import("dotenv");
    config({ path: envPath });
    log.success("已加载 .env 配置");
  } catch (error) {
    log.warn(`加载 .env 失败: ${error.message}`);
  }
}

// 检查必需的环境变量
function checkRequiredEnv() {
  // SQLite 不需要必需的环境变量，使用默认路径即可
  log.info("环境变量检查通过");
}

// 检查平台依赖是否匹配
async function checkPlatformDependencies() {
  const currentPlatform = platform();
  const isWSL =
    existsSync("/proc/version") &&
    (await readFile("/proc/version", "utf-8")).toLowerCase().includes("microsoft");

  log.step(`检测运行平台: ${isWSL ? "WSL (Linux)" : currentPlatform}`);

  // 检查 node_modules 是否存在
  const nodeModulesPath = join(__dirname, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    log.warn("node_modules 不存在，需要安装依赖");
    return await reinstallDependencies();
  }

  // 检查 .bin 目录
  const binPath = join(nodeModulesPath, ".bin");
  if (!existsSync(binPath)) {
    log.warn(".bin 目录不存在，依赖可能损坏");
    log.step("正在自动重新安装依赖...");
    return await reinstallDependencies();
  }

  // 检查 .bin 目录中的可执行文件类型
  const { readdirSync } = await import("node:fs");
  const binFiles = readdirSync(binPath);

  if (binFiles.length === 0) {
    log.warn(".bin 目录为空，依赖可能损坏");
    log.step("正在自动重新安装依赖...");
    return await reinstallDependencies();
  }

  // 检查关键命令的可执行文件
  const drizzleKitPath = join(binPath, "drizzle-kit");
  const drizzleKitCmdPath = join(binPath, "drizzle-kit.cmd");

  if (isWindows) {
    // Windows 需要 .cmd 文件
    if (!existsSync(drizzleKitCmdPath)) {
      log.warn("检测到依赖是在 Linux/WSL 中安装的或已损坏");
      log.warn("Windows 需要 .cmd 可执行文件");
      log.step("正在自动重新安装依赖...");
      return await reinstallDependencies();
    }
  } else {
    // Linux/macOS 需要 shell 脚本（没有 .cmd）
    if (!existsSync(drizzleKitPath)) {
      log.warn("检测到依赖是在 Windows 中安装的或已损坏");
      log.warn("Linux/macOS 需要 shell 脚本可执行文件");
      log.step("正在自动重新安装依赖...");
      return await reinstallDependencies();
    }
  }

  // 检查平台特定的 esbuild 包（pnpm 存储在 .pnpm 目录）
  const platformPackages = {
    win32: "win32-x64",
    linux: "linux-x64",
    darwin: "darwin-x64",
  };

  const detectedPlatform = isWSL ? "linux" : currentPlatform;
  const expectedPlatform = platformPackages[detectedPlatform];

  if (!expectedPlatform) {
    log.warn(`未知平台: ${detectedPlatform}`);
    return true; // 继续尝试
  }

  // 检查 pnpm 存储目录
  const pnpmStorePath = join(nodeModulesPath, ".pnpm");
  if (!existsSync(pnpmStorePath)) {
    log.warn("pnpm 存储目录不存在，可能不是 pnpm 安装的依赖");
    return true; // 继续尝试
  }

  // 在 pnpm 存储中查找对应平台的 esbuild 包
  const pnpmDirs = readdirSync(pnpmStorePath);
  const hasCorrectPlatform = pnpmDirs.some((dir) =>
    dir.startsWith(`@esbuild+${expectedPlatform}@`)
  );

  if (!hasCorrectPlatform) {
    log.warn(`检测到平台不匹配: 缺少 @esbuild/${expectedPlatform}`);
    log.warn("这通常发生在跨平台复制 node_modules 时");
    log.step("正在自动重新安装依赖...");

    // 直接触发自动重新安装
    return await reinstallDependencies();
  }

  log.success("平台依赖检查通过");
  return true;
}

// 重新安装依赖
async function reinstallDependencies() {
  log.step("强制重新安装依赖 (pnpm install --force)...");
  log.info("这可能需要几分钟，请耐心等待");

  // 先设置淘宝镜像加速下载
  log.info("正在配置 npm 镜像源...");
  const setRegistry = spawn(
    "pnpm",
    ["config", "set", "registry", "https://registry.npmmirror.com"],
    {
      cwd: __dirname,
      stdio: "pipe",
      shell: true,
    }
  );

  await new Promise((resolve) => {
    setRegistry.on("close", (code) => {
      if (code === 0) {
        log.success("已设置淘宝镜像源 (registry.npmmirror.com)");
      } else {
        log.warn("设置镜像源失败，将使用默认源");
      }
      resolve();
    });
    setRegistry.on("error", () => resolve());
  });

  return new Promise((resolve) => {
    // Windows 上也使用 npx pnpm 确保能找到 pnpm
    const cmd = isWindows ? "npx" : "pnpm";
    const args = isWindows ? ["pnpm", "install", "--force"] : ["install", "--force"];

    // 设置环境变量，强制使用预编译的 better-sqlite3
    const installEnv = {
      ...process.env,
      npm_config_build_from_source: "false",
      SQLITE_SKIP_INSTALL_FROM_SOURCE: "1",
    };

    log.info("已启用预编译版本 (跳过原生模块编译)");

    const install = spawn(cmd, args, {
      cwd: __dirname,
      stdio: "inherit",
      shell: true,
      env: installEnv,
    });

    install.on("close", (installCode) => {
      if (installCode === 0) {
        log.success("依赖安装完成");
        resolve(true);
      } else {
        log.error(`依赖安装失败 (退出码: ${installCode})`);
        resolve(false);
      }
    });

    install.on("error", (error) => {
      log.error(`安装依赖失败: ${error.message}`);
      resolve(false);
    });
  });
}

// 检查必需的环境变量 (保持原有函数名以兼容后续代码)
function _checkRequiredEnvLegacy() {
  // SQLite 不需要必需的环境变量，使用默认路径即可
  log.info("环境变量检查通过");
}

// 检查数据库目录
async function checkDatabase() {
  const dbPath = process.env.DATABASE_URL || "./data/sqlite.db";
  log.step(`检查数据库路径: ${dbPath}`);

  try {
    const { mkdirSync, existsSync } = await import("node:fs");
    const { dirname } = await import("node:path");

    // 确保数据目录存在
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      log.info(`创建数据目录: ${dbDir}`);
      mkdirSync(dbDir, { recursive: true });
    }

    log.success("数据库目录准备完成");
    return true;
  } catch (error) {
    log.error(`数据库目录检查失败: ${error.message}`);
    return false;
  }
}

// 检查并生成 SQLite 迁移文件
async function _checkAndGenerateMigrations() {
  const journalPath = join(__dirname, "drizzle-sqlite/meta/_journal.json");

  try {
    let needsGeneration = false;
    let generationReason = "";

    // 检查 journal 文件是否存在
    if (!existsSync(journalPath)) {
      generationReason = "未检测到迁移文件";
      needsGeneration = true;
    } else {
      // 读取并检查 dialect
      const journalContent = await readFile(journalPath, "utf-8");
      const journal = JSON.parse(journalContent);

      if (journal.dialect !== "sqlite") {
        generationReason = `检测到旧的 ${journal.dialect} 迁移文件`;

        // 备份旧的迁移文件
        const { renameSync, mkdirSync } = await import("node:fs");
        const backupDir = join(__dirname, "drizzle_backup");

        if (!existsSync(backupDir)) {
          mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupPath = join(backupDir, `backup-${timestamp}`);

        log.step(`备份旧迁移文件到: ${backupPath}`);
        renameSync(join(__dirname, "drizzle-sqlite"), backupPath);

        needsGeneration = true;
      } else if (journal.entries && journal.entries.length === 0) {
        generationReason = "检测到空的迁移记录";
        needsGeneration = true;
      } else {
        // 即使 journal 存在，也尝试生成新的迁移（drizzle-kit 会检测 schema 变化）
        log.step("检查 Schema 是否有变化...");
        generationReason = "检查 Schema 变化";
        needsGeneration = true;
      }
    }

    if (needsGeneration) {
      log.step(`${generationReason}，正在生成迁移文件...`);

      return new Promise((resolve) => {
        let generate;

        if (isWindows) {
          // Windows: 使用 .cmd 文件
          const drizzleBin = join(__dirname, "node_modules", ".bin", "drizzle-kit.cmd");
          generate = spawn(drizzleBin, ["generate"], {
            cwd: __dirname,
            stdio: "inherit",
            shell: true,
          });
        } else {
          // Linux/macOS: 使用 pnpm 脚本
          generate = spawn("pnpm", ["db:generate"], {
            cwd: __dirname,
            stdio: "inherit",
            shell: true,
          });
        }

        generate.on("close", (code) => {
          if (code === 0) {
            log.success("迁移文件生成完成");
            resolve(true);
          } else {
            log.error(`迁移文件生成失败 (退出码: ${code})`);
            resolve(false);
          }
        });

        generate.on("error", (error) => {
          log.error(`执行生成命令失败: ${error.message}`);
          resolve(false);
        });
      });
    }

    return true;
  } catch (error) {
    log.error(`检查迁移文件失败: ${error.message}`);
    return false;
  }
}

// 执行数据库迁移
async function runMigration() {
  const autoMigrate = process.env.AUTO_MIGRATE !== "false";

  if (!autoMigrate) {
    log.info("自动迁移已禁用 (AUTO_MIGRATE=false)");
    return true;
  }

  // 1. 先执行智能迁移脚本（处理特殊迁移，如 api_urls 表重构）
  log.step("执行智能迁移脚本...");
  const smartMigrationOk = await runSmartMigrations();
  if (!smartMigrationOk) {
    log.warn("智能迁移脚本执行失败，继续尝试标准迁移...");
  }

  // 2. 执行标准 drizzle 迁移
  log.step("执行数据库迁移...");

  return new Promise((resolve) => {
    let migrate;

    if (isWindows) {
      // Windows: 使用 .cmd 文件
      const drizzleBin = join(__dirname, "node_modules", ".bin", "drizzle-kit.cmd");
      migrate = spawn(drizzleBin, ["migrate"], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true,
      });
    } else {
      // Linux/macOS: 使用 pnpm 脚本
      migrate = spawn("pnpm", ["db:migrate"], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true,
      });
    }

    migrate.on("close", (code) => {
      if (code === 0) {
        log.success("数据库迁移完成");
        resolve(true);
      } else {
        log.error(`数据库迁移失败 (退出码: ${code})`);
        resolve(false);
      }
    });

    migrate.on("error", (error) => {
      log.error(`执行迁移命令失败: ${error.message}`);
      resolve(false);
    });
  });
}

// 执行智能迁移脚本（处理需要检测数据库状态的特殊迁移）
async function runSmartMigrations() {
  const smartMigrations = [
    "scripts/migrate-api-urls-match-url.mjs", // api_urls 表 provider_type -> match_url
  ];

  for (const script of smartMigrations) {
    const scriptPath = join(__dirname, script);
    if (!existsSync(scriptPath)) {
      log.warn(`智能迁移脚本不存在: ${script}`);
      continue;
    }

    const ok = await new Promise((resolve) => {
      const proc = spawn("node", [scriptPath], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true,
      });

      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });

    if (!ok) {
      return false;
    }
  }

  return true;
}

// 读取版本信息
async function getVersion() {
  try {
    const versionPath = join(__dirname, "VERSION");
    if (existsSync(versionPath)) {
      const version = await readFile(versionPath, "utf-8");
      return version.trim();
    }
  } catch (_error) {
    // 忽略错误
  }
  return "unknown";
}

// 清理 Next.js 构建缓存
async function cleanNextCache() {
  const nextDir = join(__dirname, ".next");

  if (!existsSync(nextDir)) {
    return true;
  }

  log.step("检测到 .next 构建缓存，正在清理以确保使用最新代码...");

  try {
    const { rmSync } = await import("node:fs");
    rmSync(nextDir, { recursive: true, force: true });
    log.success(".next 缓存已清理");
    return true;
  } catch (error) {
    log.warn(`清理缓存失败: ${error.message}`);
    log.info("将继续使用现有缓存");
    return true; // 失败不阻止启动
  }
}

// 复制静态资源到 standalone 目录
async function copyStaticAssets() {
  log.step("正在复制静态资源到 standalone 目录...");

  try {
    const { cpSync, existsSync, mkdirSync, copyFileSync } = await import("node:fs");

    const staticSrc = join(__dirname, ".next/static");
    const staticDest = join(__dirname, ".next/standalone/.next/static");
    const publicSrc = join(__dirname, "public");
    const publicDest = join(__dirname, ".next/standalone/public");

    // 复制 .next/static
    if (existsSync(staticSrc)) {
      cpSync(staticSrc, staticDest, { recursive: true, force: true });
      log.success("已复制 .next/static");
    } else {
      log.warn(".next/static 不存在，跳过");
    }

    // 复制 public
    if (existsSync(publicSrc)) {
      cpSync(publicSrc, publicDest, { recursive: true, force: true });
      log.success("已复制 public 目录");
    } else {
      log.warn("public 目录不存在，跳过");
    }

    // 复制 data 目录（SQLite 数据库）
    const dataSrc = join(__dirname, "data");
    const dataDest = join(__dirname, ".next/standalone/data");
    if (existsSync(dataSrc)) {
      mkdirSync(dataDest, { recursive: true });
      // 复制 SQLite 数据库文件
      const sqliteFile = join(dataSrc, "sqlite.db");
      if (existsSync(sqliteFile)) {
        copyFileSync(sqliteFile, join(dataDest, "sqlite.db"));
        log.success("已复制 data/sqlite.db");
      }
      // 复制 drizzle 目录（如果存在）
      const drizzleDir = join(dataSrc, "drizzle");
      if (existsSync(drizzleDir)) {
        cpSync(drizzleDir, join(dataDest, "drizzle"), { recursive: true });
        log.success("已复制 data/drizzle");
      }
    } else {
      log.warn("data 目录不存在，跳过");
    }

    return true;
  } catch (error) {
    log.error(`复制静态资源失败: ${error.message}`);
    return false;
  }
}

// 检查并构建应用
async function checkAndBuild() {
  const nodeEnv = process.env.NODE_ENV || "production";

  // 开发环境不需要构建
  if (nodeEnv === "development") {
    return true;
  }

  // 仅在明确指定时清理缓存（默认使用增量构建提升性能）
  if (options.cleanCache) {
    await cleanNextCache();
  } else {
    log.info("使用增量构建（如需强制重新构建，请使用 --clean-cache）");
  }

  log.step("开始构建应用...");
  log.info("这可能需要几分钟时间，请耐心等待");

  return new Promise((resolve) => {
    // 直接使用 npx next，避免 Windows 找不到命令
    const cmd = isWindows ? "npx" : "npx";
    const args = isWindows ? ["next", "build", "--debug"] : ["next", "build", "--debug"];

    // 构建优化：设置环境变量以加速构建
    const buildEnv = {
      ...process.env,
      // 禁用 Source Maps 生成（可节省 30-40% 构建时间）
      // 用户可通过 --enable-sourcemaps 启用以便调试
      NEXT_DISABLE_SOURCEMAPS: options.enableSourceMaps
        ? "0"
        : process.env.NEXT_DISABLE_SOURCEMAPS || "1",
      // 确保生产环境
      NODE_ENV: "production",
      // 低配服务器优化：限制 Node.js 内存使用（避免 OOM）
      // 2G 内存服务器建议设置为 1536MB（留给系统和其他进程）
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=1536",
    };

    if (!options.enableSourceMaps) {
      log.info("已启用构建优化（禁用 Source Maps，构建速度提升 30-40%）");
    } else {
      log.info("已启用 Source Maps（方便调试，但会增加构建时间）");
    }
    log.info("已启用详细构建日志（--debug 模式）");
    log.info("已限制内存使用为 1536MB（适合 2G 内存服务器）");

    const build = spawn(cmd, args, {
      cwd: __dirname,
      stdio: "inherit",
      shell: true,
      env: buildEnv,
    });

    build.on("close", async (code) => {
      if (code === 0) {
        log.success("应用构建完成");

        // 构建成功后复制静态资源到 standalone 目录
        const copyOk = await copyStaticAssets();
        if (!copyOk) {
          log.warn("静态资源复制失败，但不影响启动");
        }

        resolve(true);
      } else {
        log.error(`应用构建失败 (退出码: ${code})`);
        log.info("你可以尝试手动运行: pnpm build");
        resolve(false);
      }
    });

    build.on("error", (error) => {
      log.error(`执行构建命令失败: ${error.message}`);
      resolve(false);
    });
  });
}

// 启动应用
function startApp() {
  const port = process.env.APP_PORT || process.env.PORT || 23000;
  const nodeEnv = process.env.NODE_ENV || "production";

  log.step(`启动应用 (端口: ${port}, 环境: ${nodeEnv})...`);

  // 检查是否存在构建输出
  const standalonePath = join(__dirname, ".next/standalone/server.js");
  const buildIdPath = join(__dirname, ".next/BUILD_ID");
  const hasStandalone = existsSync(standalonePath);
  const hasBuild = existsSync(buildIdPath);

  let cmd, args;

  if (hasStandalone && nodeEnv === "production") {
    // 优先使用 standalone 模式启动（与 output: 'standalone' 配置兼容）
    cmd = "node";
    args = [".next/standalone/server.js"];
    log.info("使用 standalone 模式启动");
  } else if (hasBuild && nodeEnv === "production") {
    // 备用：next start 启动
    cmd = isWindows ? "npx" : "pnpm";
    args = isWindows ? ["next", "start"] : ["start"];
    log.info("使用 next start 启动");
  } else if (nodeEnv === "development") {
    // 开发模式
    cmd = isWindows ? "npx" : "pnpm";
    args = isWindows ? ["next", "dev", "--port", String(port), "--turbo"] : ["dev"];
    log.info("使用 next dev 启动 (开发模式)");
  } else {
    // 未找到构建产物，回退到开发模式
    log.warn("未找到构建产物，使用开发模式启动");
    cmd = isWindows ? "npx" : "pnpm";
    args = isWindows ? ["next", "dev", "--port", String(port), "--turbo"] : ["dev"];
  }

  const app = spawn(cmd, args, {
    cwd: __dirname,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      PORT: String(port),
      APP_PORT: String(port),
    },
  });

  // 优雅关闭处理
  const shutdown = async (signal) => {
    log.info(`\n收到 ${signal} 信号，正在优雅关闭...`);

    app.kill("SIGTERM");

    // 等待最多 30 秒
    const timeout = setTimeout(() => {
      log.warn("应用未在 30 秒内关闭，强制终止");
      app.kill("SIGKILL");
    }, 30000);

    app.on("exit", () => {
      clearTimeout(timeout);
      log.success("应用已关闭");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  app.on("error", (error) => {
    log.error(`启动失败: ${error.message}`);
    process.exit(1);
  });

  app.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      log.error(`应用异常退出 (退出码: ${code})`);
      process.exit(code);
    }
  });

  return app;
}

// 主函数
async function main() {
  // 显示帮助信息
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // 开发模式：强制设置 NODE_ENV=development
  if (options.dev) {
    process.env.NODE_ENV = "development";
  }

  const version = await getVersion();

  console.log("");
  console.log(
    `${colors.bright}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(`${colors.bright}  Claude Code Hub v${version}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log("");

  // 显示当前启动模式
  if (options.dev) {
    log.info(`${colors.green}开发模式${colors.reset} (NODE_ENV=development, 跳过构建)`);
  } else if (options.quick) {
    log.info(`${colors.yellow}快速启动模式${colors.reset} (跳过依赖检查和构建)`);
  } else {
    const skipped = [];
    if (options.skipInstall) skipped.push("依赖检查");
    if (options.skipBuild) skipped.push("构建");
    if (options.skipMigration) skipped.push("迁移");
    if (skipped.length > 0) {
      log.info(`跳过步骤: ${skipped.join(", ")}`);
    }
  }
  console.log("");

  // 1. 加载环境变量
  await loadEnv();

  // 2. 检查平台依赖
  if (!options.skipInstall) {
    const platformOk = await checkPlatformDependencies();
    if (!platformOk) {
      log.error("平台依赖检查失败，无法启动应用");
      log.info("请手动运行: pnpm install");
      log.info("或使用 --skip-install 跳过依赖检查");
      process.exit(1);
    }
  } else {
    log.info("已跳过依赖检查");
  }

  // 3. 检查环境变量
  checkRequiredEnv();

  // 4. 检查数据库
  const dbOk = await checkDatabase();
  if (!dbOk) {
    log.error("数据库目录检查失败，无法启动应用");
    process.exit(1);
  }

  // 5. 执行数据库迁移（只执行已有的迁移文件，不自动生成）
  if (!options.skipMigration) {
    const migrateOk = await runMigration();
    if (!migrateOk) {
      log.error("数据库迁移失败，无法启动应用");
      process.exit(1);
    }
  } else {
    log.info("已跳过数据库迁移");
  }

  // 6. 检查并构建应用
  if (!options.skipBuild) {
    const buildOk = await checkAndBuild();
    if (!buildOk) {
      log.error("应用构建失败，无法启动应用");
      log.info("你可以使用 --skip-build 跳过构建步骤");
      process.exit(1);
    }
  } else {
    log.info("已跳过应用构建");
  }

  console.log("");
  console.log(`${colors.green}${colors.bright}所有检查通过，准备启动应用...${colors.reset}`);
  console.log("");

  // 7. 启动应用
  startApp();
}

// 执行主函数
main().catch((error) => {
  log.error(`启动失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
