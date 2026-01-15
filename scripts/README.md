# Docker 更新管理脚本使用说明

## 📖 简介

`docker-update.mjs` 是一个交互式的 Docker 镜像更新管理工具，提供了友好的菜单界面来管理 Claude Code Hub 的 Docker 部署。

## ✨ 功能特性

- 🚀 **一键更新** - 自动备份、拉取镜像、重启服务
- 📦 **镜像管理** - 拉取、查看、清理镜像
- 🔄 **服务控制** - 重启服务、查看状态
- 📝 **日志查看** - 查看历史日志和实时日志
- 💾 **数据备份** - 自动备份数据库和 Redis 数据
- 🔙 **版本回滚** - 快速回滚到旧版本
- 🧹 **空间清理** - 清理未使用的镜像

## 🚀 快速开始

### 前置要求

- Node.js ≥ 18
- Docker 和 Docker Compose
- 在项目根目录运行（包含 `docker-compose.yaml` 文件）

### 运行脚本

```bash
# 方式 1: 直接运行
node scripts/docker-update.mjs

# 方式 2: 使用可执行权限
./scripts/docker-update.mjs
```

## 📋 菜单选项说明

### 1. 🚀 一键更新（推荐）

完整的更新流程，包括：
- 检查 Docker 环境
- 显示当前镜像信息
- 备份数据（可选）
- 拉取最新镜像
- 重启服务
- 健康检查
- 查看日志（可选）

**适用场景**：日常更新、版本升级

### 2. 📦 仅拉取最新镜像

只下载最新镜像，不重启服务。

**适用场景**：提前下载镜像，稍后手动重启

### 3. 🔄 重启服务

使用当前镜像重启所有服务。

**适用场景**：配置修改后重启、服务异常恢复

### 4. 📊 查看服务状态

显示容器运行状态和健康检查结果。

**适用场景**：检查服务是否正常运行

### 5. 📝 查看日志

查看最近 50 行应用日志。

**适用场景**：快速查看最近的日志信息

### 6. 📡 查看实时日志

实时跟踪应用日志输出（按 Ctrl+C 退出）。

**适用场景**：调试问题、监控服务运行

### 7. 💾 备份数据

备份 `./data` 目录到 `./backups` 目录。

**适用场景**：更新前备份、定期备份

### 8. 🔙 回滚到旧版本

切换到之前的镜像版本。

**适用场景**：新版本有问题需要回滚

### 9. 🧹 清理旧镜像

删除未使用的 Docker 镜像，释放磁盘空间。

**适用场景**：磁盘空间不足、定期清理

## 💡 使用示例

### 示例 1: 日常更新

```bash
# 运行脚本
./scripts/docker-update.mjs

# 选择选项 1（一键更新）
请输入选项 (0-9): 1

# 按提示操作
是否需要备份数据？(y/n，默认 y): y
是否查看服务日志？(y/n): y
```

### 示例 2: 仅备份数据

```bash
# 运行脚本
./scripts/docker-update.mjs

# 选择选项 7（备份数据）
请输入选项 (0-9): 7

# 确认备份
是否需要备份数据？(y/n，默认 y): y
```

### 示例 3: 查看实时日志

```bash
# 运行脚本
./scripts/docker-update.mjs

# 选择选项 6（查看实时日志）
请输入选项 (0-9): 6

# 按 Ctrl+C 退出日志查看
```

## 📁 备份文件位置

备份文件保存在 `./backups` 目录，文件名格式：

```
data_backup_2026-01-15T12-30-45.tar.gz
```

## ⚠️ 注意事项

1. **运行位置**：必须在项目根目录运行（包含 `docker-compose.yaml` 的目录）
2. **权限要求**：需要有 Docker 操作权限
3. **备份建议**：重要更新前建议先备份数据
4. **磁盘空间**：确保有足够的磁盘空间用于备份和新镜像
5. **网络连接**：拉取镜像需要稳定的网络连接

## 🔧 故障排除

### 问题 1: 脚本无法运行

```bash
# 检查 Node.js 版本
node --version  # 应该 ≥ 18

# 检查文件权限
ls -l scripts/docker-update.mjs

# 添加可执行权限
chmod +x scripts/docker-update.mjs
```

### 问题 2: Docker 命令失败

```bash
# 检查 Docker 是否运行
docker ps

# 检查 Docker Compose
docker compose version
```

### 问题 3: 镜像拉取失败

```bash
# 检查网络连接
ping ghcr.io

# 手动拉取镜像
docker pull ghcr.io/ding113/claude-code-hub:latest
```

## 📞 获取帮助

如遇到问题，请：

1. 查看脚本输出的错误信息
2. 检查 Docker 日志：`docker compose logs app`
3. 访问项目 GitHub Issues：https://github.com/ding113/claude-code-hub/issues
4. 加入 Telegram 交流群：https://t.me/ygxz_group
