#!/usr/bin/env python3
"""
AnyRouter Token 批量创建工具
用法:
  python create_tokens.py -f cookies.txt -n 5 -p mytoken
  python create_tokens.py --api-token xxx -n 5 -p mytoken
"""

import argparse
import asyncio
import json
import random
import string
import time
import sys
import tempfile
from pathlib import Path

try:
    import requests
except ImportError:
    print("请先安装 requests: pip install requests")
    sys.exit(1)

try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None


# Cookie API 配置
COOKIE_API_URL = "https://cookie.ronghuaxueleng.top/api/cookies"
COOKIE_API_DOMAIN = "anyrouter.top"

# WAF 相关配置
WAF_TARGET_URL = "https://anyrouter.top/login"
WAF_REQUIRED_COOKIES = ["acw_tc", "cdn_sec_tc", "acw_sc__v2"]


async def get_waf_cookies(proxy: str = None) -> dict[str, str] | None:
    """使用 Playwright 获取 WAF cookies (参考 anyrouter-check-in 项目)"""
    if async_playwright is None:
        print("[ERROR] 未安装 playwright, 请运行: pip install playwright && playwright install chromium")
        return None

    print("[WAF] 启动浏览器获取 WAF cookies...")

    async with async_playwright() as p:
        with tempfile.TemporaryDirectory() as temp_dir:
            # 构建启动参数
            launch_options = {
                "user_data_dir": temp_dir,
                "headless": False,
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
                "viewport": {"width": 1920, "height": 1080},
                "args": [
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--disable-web-security",
                    "--disable-features=VizDisplayCompositor",
                    "--no-sandbox",
                ],
            }
            if proxy:
                launch_options["proxy"] = {"server": proxy}

            context = await p.chromium.launch_persistent_context(**launch_options)

            page = await context.new_page()

            try:
                print(f"[WAF] 访问 {WAF_TARGET_URL} 等待 WAF 验证...")
                await page.goto(WAF_TARGET_URL, wait_until="networkidle")

                try:
                    await page.wait_for_function(
                        'document.readyState === "complete"', timeout=5000
                    )
                except Exception:
                    await page.wait_for_timeout(3000)

                cookies = await page.context.cookies()

                waf_cookies = {}
                for cookie in cookies:
                    name = cookie.get("name")
                    value = cookie.get("value")
                    if name in WAF_REQUIRED_COOKIES and value is not None:
                        waf_cookies[name] = value

                missing = [c for c in WAF_REQUIRED_COOKIES if c not in waf_cookies]
                if missing:
                    print(f"[WAF] 部分 WAF cookies 未获取到: {missing} (可能不影响使用)")

                print(f"[WAF] 成功获取 {len(waf_cookies)} 个 WAF cookies: {list(waf_cookies.keys())}")
                await context.close()
                return waf_cookies

            except Exception as e:
                print(f"[WAF] 获取 WAF cookies 失败: {e}")
                await context.close()
                return None


def merge_waf_cookies(original_cookie: str, waf_cookies: dict[str, str]) -> str:
    """将 WAF cookies 合并到原始 cookie 字符串中"""
    if not waf_cookies:
        return original_cookie

    # 解析原始 cookie 为 dict
    existing = {}
    if original_cookie:
        for part in original_cookie.split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                existing[k.strip()] = v.strip()

    # WAF cookies 优先（覆盖同名的旧值）
    existing.update(waf_cookies)

    return "; ".join(f"{k}={v}" for k, v in existing.items())


def extract_user_id_from_session(session_value: str) -> str | None:
    """从session cookie中提取user_id"""
    import base64
    import re

    try:
        # session格式: base64编码的数据|签名
        parts = session_value.split("|")
        if not parts:
            return None

        # 尝试解码base64部分
        encoded = parts[0]
        # 补齐padding
        padding = 4 - len(encoded) % 4
        if padding != 4:
            encoded += "=" * padding

        decoded = base64.b64decode(encoded).decode("utf-8", errors="ignore")

        # 方法1: 查找 github_XXXX 格式的用户名来提取ID
        match = re.search(r"github_(\d+)", decoded)
        if match:
            return match.group(1)

        # 方法2: 查找其他可能的用户ID模式
        # 格式可能是 id...int...<数字>
        match = re.search(r"id.int.{2,4}(\d+)", decoded)
        if match:
            return match.group(1)

    except Exception:
        pass

    return None


def fetch_cookies_from_api(api_token: str) -> list[dict]:
    """从Cookie API获取cookie列表"""
    headers = {"Authorization": f"Bearer {api_token}"}
    params = {
        "include_values": "true",
        "domain": COOKIE_API_DOMAIN,
        "page": 1,
        "per_page": 200,
    }

    try:
        resp = requests.get(COOKIE_API_URL, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        accounts = []
        cookies_data = data if isinstance(data, list) else data.get("data", data.get("cookies", []))

        for item in cookies_data:
            if not isinstance(item, dict):
                continue

            # 跳过检测失败的cookie
            detection_status = item.get("detection_status", "")
            if detection_status in ["error", "failed"]:
                custom_name = item.get("custom_name", "unknown")
                print(f"  跳过失效cookie: {custom_name} ({detection_status})")
                continue

            # 从cookies_data构建cookie字符串
            cookies_list = item.get("cookies_data", [])
            if not cookies_list:
                continue

            cookie_parts = []
            for c in cookies_list:
                name = c.get("name", "")
                value = c.get("value", "")
                if name and value:
                    cookie_parts.append(f"{name}={value}")

            if not cookie_parts:
                continue

            cookie_str = "; ".join(cookie_parts)

            # 从 local_storage_data.user.id 获取 user_id
            user_id = None
            local_storage = item.get("local_storage_data", {})
            if isinstance(local_storage, dict):
                user = local_storage.get("user", {})
                if isinstance(user, dict):
                    user_id = user.get("id")
                    if user_id:
                        user_id = str(user_id)

            custom_name = item.get("custom_name", "unknown")
            if user_id:
                print(f"  发现账号: {custom_name} (user_id: {user_id})")
            else:
                print(f"  发现账号: {custom_name} (user_id: 未知)")

            accounts.append({
                "cookie": cookie_str,
                "user_id": user_id,
                "name": custom_name,
            })

        print(f"\n从API获取到 {len(accounts)} 个有效cookie")
        return accounts

    except Exception as e:
        print(f"获取cookie失败: {e}")
        sys.exit(1)


class TokenCreator:
    API_URL = "https://anyrouter.top/api/token/"
    SEARCH_API_URL = "https://anyrouter.top/api/token/search"

    HEADERS = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9",
        "cache-control": "no-store",
        "content-type": "application/json",
        "dnt": "1",
        "origin": "https://anyrouter.top",
        "pragma": "no-cache",
        "referer": "https://anyrouter.top/console/token",
        "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    }

    def __init__(self, token_config: dict, proxy: str = None):
        self.token_config = token_config
        self.created_tokens = []
        self.proxies = {"http": proxy, "https": proxy} if proxy else None

    def search_tokens(self, cookie: str, user_id: str, keyword: str) -> dict[str, str]:
        """搜索 token 获取实际的 key，返回 {name: key} 映射"""
        headers = self.HEADERS.copy()
        headers["cookie"] = cookie
        headers["new-api-user"] = user_id
        # 搜索 API 是 GET 请求，不需要 content-type
        headers.pop("content-type", None)

        try:
            resp = requests.get(
                self.SEARCH_API_URL,
                headers=headers,
                params={"keyword": keyword, "token": ""},
                timeout=30,
                proxies=self.proxies,
            )

            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    tokens_data = data.get("data", [])
                    # 返回 {name: "sk-" + key} 映射
                    return {
                        t.get("name", ""): "sk-" + t.get("key", "")
                        for t in tokens_data
                        if t.get("name") and t.get("key")
                    }
        except Exception as e:
            print(f"    [WARN] 搜索 token 失败: {e}")

        return {}

    def create_token(self, cookie: str, user_id: str, token_name: str) -> dict | None:
        """创建单个token"""
        headers = self.HEADERS.copy()
        headers["cookie"] = cookie
        headers["new-api-user"] = user_id

        payload = {
            "name": token_name,
            "remain_quota": self.token_config.get("remain_quota", 500000),
            "expired_time": self.token_config.get("expired_time", -1),
            "unlimited_quota": self.token_config.get("unlimited_quota", True),
            "model_limits_enabled": self.token_config.get("model_limits_enabled", False),
            "model_limits": self.token_config.get("model_limits", ""),
            "allow_ips": self.token_config.get("allow_ips", ""),
            "group": self.token_config.get("group", ""),
        }

        try:
            resp = requests.post(
                self.API_URL, headers=headers, json=payload, timeout=30, proxies=self.proxies
            )

            # 调试: 打印原始响应
            if resp.status_code != 200 or not resp.text.startswith("{"):
                print(f"    [DEBUG] HTTP {resp.status_code}: {resp.text[:200]}")

            data = resp.json()

            if resp.status_code == 200 and data.get("success", False):
                # 尝试多种可能的 key 路径
                token_key = (
                    data.get("data", {}).get("key", "")
                    or data.get("key", "")
                    or data.get("data", {}).get("token", "")
                    or data.get("token", "")
                )
                if not token_key:
                    print(f"    [DEBUG] 响应数据: {json.dumps(data, ensure_ascii=False)[:300]}")
                return {"success": True, "key": token_key, "data": data}
            else:
                return {"success": False, "error": data.get("message", str(data))}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def list_tokens(self, cookie: str, user_id: str, page: int = 0, size: int = 100) -> list[dict]:
        """获取 token 列表"""
        headers = self.HEADERS.copy()
        headers["cookie"] = cookie
        headers["new-api-user"] = user_id
        # GET 请求不需要 content-type
        headers.pop("content-type", None)

        try:
            resp = requests.get(
                f"{self.API_URL}?p={page}&size={size}",
                headers=headers,
                timeout=30,
                proxies=self.proxies,
            )

            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    return data.get("data", [])
                else:
                    print(f"    [WARN] 获取 token 列表失败: {data.get('message', '未知错误')}")
            else:
                print(f"    [WARN] 获取 token 列表 HTTP {resp.status_code}")
        except Exception as e:
            print(f"    [WARN] 获取 token 列表异常: {e}")

        return []

    def delete_token(self, cookie: str, user_id: str, token_id: int) -> dict:
        """删除单个 token"""
        headers = self.HEADERS.copy()
        headers["cookie"] = cookie
        headers["new-api-user"] = user_id
        # DELETE 请求不需要 content-type
        headers.pop("content-type", None)

        try:
            resp = requests.delete(
                f"{self.API_URL}{token_id}",
                headers=headers,
                timeout=30,
                proxies=self.proxies,
            )

            data = resp.json() if resp.text.startswith("{") else {"success": False}

            if resp.status_code == 200 and data.get("success"):
                return {"success": True, "id": token_id}
            else:
                return {"success": False, "id": token_id, "error": data.get("message", str(data))}
        except Exception as e:
            return {"success": False, "id": token_id, "error": str(e)}

    def batch_create(
        self, cookie: str, user_id: str, prefix: str, count: int, delay: float = 0.5
    ):
        """批量创建token"""
        print(f"\n{'='*50}")
        print(f"用户ID: {user_id}")
        print(f"创建数量: {count}")
        print(f"名称前缀: {prefix}")
        print(f"{'='*50}\n")

        success_count = 0
        fail_count = 0
        created_names = []  # 成功创建的 token 名称

        for i in range(1, count + 1):
            if count == 1:
                token_name = "cc"
            else:
                random_str = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
                token_name = f"{prefix}_{random_str}"

            result = self.create_token(cookie, user_id, token_name)

            if result and result["success"]:
                print(f"  [\033[32mOK\033[0m] {token_name} (created)")
                created_names.append(token_name)
                success_count += 1
            else:
                error = result.get("error", "未知错误") if result else "请求失败"
                print(f"  [\033[31mFAIL\033[0m] {token_name} -> {error}")
                fail_count += 1

            if i < count:
                time.sleep(delay)

        # 通过搜索 API 获取实际的 key
        tokens = []
        if created_names:
            print(f"\n[INFO] 正在获取 token keys...")
            search_keyword = "cc" if count == 1 else prefix
            key_map = self.search_tokens(cookie, user_id, search_keyword)

            for name in created_names:
                key = key_map.get(name, "")
                if key:
                    print(f"  [KEY] {name} -> {key}")
                else:
                    print(f"  [WARN] {name} -> (key not found)")
                tokens.append({"name": name, "key": key, "user_id": user_id})

        self.created_tokens.extend(tokens)
        print(f"\n完成! \033[32m成功: {success_count}\033[0m, \033[31m失败: {fail_count}\033[0m")
        return tokens

    def batch_delete(
        self,
        cookie: str,
        user_id: str,
        prefix: str = None,
        keyword: str = None,
        token_ids: list[int] = None,
        delay: float = 0.5,
        dry_run: bool = False,
    ):
        """批量删除 token

        Args:
            cookie: 登录 cookie
            user_id: 用户 ID
            prefix: 按名称前缀过滤
            keyword: 按关键词搜索过滤
            token_ids: 直接指定要删除的 token ID 列表
            delay: 删除间隔秒数
            dry_run: 仅预览不实际删除
        """
        print(f"\n{'='*50}")
        print(f"用户ID: {user_id}")
        if token_ids:
            print(f"删除模式: 指定 ID 列表 ({len(token_ids)} 个)")
        elif prefix:
            print(f"删除模式: 名称前缀匹配 '{prefix}'")
        elif keyword:
            print(f"删除模式: 关键词搜索 '{keyword}'")
        else:
            print(f"删除模式: 全部删除")
        print(f"预览模式: {'是' if dry_run else '否'}")
        print(f"{'='*50}\n")

        # 获取要删除的 token 列表
        to_delete = []

        if token_ids:
            # 直接使用指定的 ID
            to_delete = [{"id": tid, "name": f"(ID: {tid})"} for tid in token_ids]
        else:
            # 从 API 获取 token 列表
            print("[INFO] 正在获取 token 列表...")
            all_tokens = []
            page = 0
            while True:
                tokens = self.list_tokens(cookie, user_id, page=page, size=100)
                if not tokens:
                    break
                all_tokens.extend(tokens)
                if len(tokens) < 100:
                    break
                page += 1

            print(f"[INFO] 共找到 {len(all_tokens)} 个 token")

            # 过滤
            for token in all_tokens:
                name = token.get("name", "")
                token_id = token.get("id")

                if prefix and name.startswith(prefix):
                    to_delete.append(token)
                elif keyword and keyword in name:
                    to_delete.append(token)
                elif not prefix and not keyword:
                    to_delete.append(token)

        if not to_delete:
            print("[INFO] 没有找到匹配的 token")
            return []

        # 显示预览
        print(f"\n[INFO] 将删除以下 {len(to_delete)} 个 token:")
        for token in to_delete[:10]:
            print(f"  - [{token.get('id')}] {token.get('name')}")
        if len(to_delete) > 10:
            print(f"  ... 还有 {len(to_delete) - 10} 个")

        if dry_run:
            print("\n[DRY RUN] 仅预览，未实际删除")
            return to_delete

        # 执行删除
        print(f"\n[INFO] 开始删除...")
        success_count = 0
        fail_count = 0
        deleted_ids = []

        for i, token in enumerate(to_delete, 1):
            token_id = token.get("id")
            token_name = token.get("name", "")

            result = self.delete_token(cookie, user_id, token_id)

            if result["success"]:
                print(f"  [\033[32mOK\033[0m] {token_name} (ID: {token_id})")
                success_count += 1
                deleted_ids.append(token_id)
            else:
                error = result.get("error", "未知错误")
                print(f"  [\033[31mFAIL\033[0m] {token_name} (ID: {token_id}) -> {error}")
                fail_count += 1

            if i < len(to_delete):
                time.sleep(delay)

        print(f"\n完成! \033[32m成功: {success_count}\033[0m, \033[31m失败: {fail_count}\033[0m")
        return deleted_ids


def parse_cookie_file(file_path: str) -> list[dict]:
    """
    解析cookie文件
    支持格式:
    1. JSON格式: {"cookie": "xxx", "user_id": "123", "prefix": "token", "count": 5}
    2. 分隔符格式: cookie|user_id|prefix|count
    3. 纯cookie (需要命令行指定user_id)
    """
    accounts = []
    path = Path(file_path)

    if not path.exists():
        print(f"错误: 文件不存在 {file_path}")
        sys.exit(1)

    content = path.read_text(encoding="utf-8").strip()

    # 尝试解析为JSON数组
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return [data]
    except json.JSONDecodeError:
        pass

    # 按行解析
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        # 尝试解析为JSON对象
        try:
            account = json.loads(line)
            accounts.append(account)
            continue
        except json.JSONDecodeError:
            pass

        # 分隔符格式: cookie|user_id|prefix|count
        if "|" in line:
            parts = line.split("|")
            account = {"cookie": parts[0]}
            if len(parts) > 1:
                account["user_id"] = parts[1]
            if len(parts) > 2:
                account["prefix"] = parts[2]
            if len(parts) > 3:
                account["count"] = int(parts[3])
            accounts.append(account)
        else:
            # 纯cookie
            accounts.append({"cookie": line})

    return accounts


async def main():
    parser = argparse.ArgumentParser(
        description="AnyRouter Token 批量创建/删除工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
=== 创建模式 (默认) ===
数据来源 (二选一):

1. 从Cookie API获取 (自动提取user_id):
   python create_tokens.py --api-token xxx -n 5

2. 从文件读取:
   python create_tokens.py -f cookies.txt -n 5

Cookie文件格式:
   cookie|user_id|prefix|count
   session=xxx;acw_tc=yyy|6702|mytoken|10

=== 删除模式 ===

1. 按前缀删除:
   python create_tokens.py -f cookies.txt --delete --delete-prefix token_abc

2. 按关键词搜索删除:
   python create_tokens.py -f cookies.txt --delete --delete-keyword test

3. 指定 ID 删除:
   python create_tokens.py -f cookies.txt --delete --delete-ids 12345,67890

4. 预览模式 (不实际删除):
   python create_tokens.py -f cookies.txt --delete --delete-prefix token_abc --dry-run
        """,
    )

    # 数据来源
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("-f", "--file", help="Cookie列表文件路径")
    source.add_argument("--api-token", help="Cookie API的Bearer Token")

    # 模式选择
    parser.add_argument("--delete", action="store_true", help="删除模式")

    # 创建模式参数
    parser.add_argument("-n", "--count", type=int, default=1, help="每个账号创建数量 (默认: 1)")
    parser.add_argument("-p", "--prefix", default="token", help="Token名称前缀 (默认: token)")
    parser.add_argument("-c", "--config", help="Token配置JSON字符串")
    parser.add_argument("--quota", type=int, default=500000, help="配额数量 (默认: 500000)")

    # 删除模式参数
    parser.add_argument("--delete-prefix", help="删除模式: 按名称前缀匹配")
    parser.add_argument("--delete-keyword", help="删除模式: 按关键词搜索")
    parser.add_argument("--delete-ids", help="删除模式: 直接指定ID列表 (逗号分隔)")

    # 通用参数
    parser.add_argument("-u", "--user-id", help="默认用户ID (可选，API模式下自动提取)")
    parser.add_argument("-o", "--output", default="created_tokens.json", help="输出文件")
    parser.add_argument("-d", "--delay", type=float, default=0.5, help="请求间隔秒数 (默认: 0.5)")
    parser.add_argument("--unlimited", action="store_true", default=True, help="无限配额")
    parser.add_argument("--proxy", help="代理地址 (如: http://127.0.0.1:7890)")
    parser.add_argument(
        "--no-waf", action="store_true", default=False,
        help="跳过 WAF 过盾 (如果已有 WAF cookies 在 cookie 中)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", default=False,
        help="预览模式 (仅显示将要删除的token，不实际删除)",
    )

    args = parser.parse_args()

    # Token配置
    token_config = {
        "remain_quota": args.quota,
        "unlimited_quota": args.unlimited,
        "expired_time": -1,
        "model_limits_enabled": False,
        "model_limits": "",
        "allow_ips": "",
        "group": "",
    }

    if args.config:
        try:
            config_data = json.loads(args.config)
            token_config.update(config_data)
        except json.JSONDecodeError as e:
            print(f"错误: 无法解析token配置 - {e}")
            sys.exit(1)

    # 获取cookie列表
    if args.api_token:
        accounts = fetch_cookies_from_api(args.api_token)
    else:
        accounts = parse_cookie_file(args.file)

    if not accounts:
        print("错误: 未找到有效的账号配置")
        sys.exit(1)

    print(f"已加载 {len(accounts)} 个账号配置")

    # 获取 WAF cookies (访问 anyrouter.top 需要代理)
    waf_cookies = {}
    if not args.no_waf:
        waf_cookies = await get_waf_cookies(proxy=args.proxy)
        if waf_cookies is None:
            print("[WAF] 无法获取 WAF cookies, 将尝试不带 WAF cookies 继续")
            waf_cookies = {}
    else:
        print("[WAF] 已跳过 WAF 过盾 (--no-waf)")

    creator = TokenCreator({}, proxy=args.proxy)

    # 删除模式
    if args.delete:
        # 解析 ID 列表
        token_ids = None
        if args.delete_ids:
            try:
                token_ids = [int(x.strip()) for x in args.delete_ids.split(",")]
            except ValueError:
                print("错误: --delete-ids 格式不正确，应为逗号分隔的数字")
                sys.exit(1)

        all_deleted = []

        for idx, account in enumerate(accounts, 1):
            cookie = account.get("cookie", "")
            user_id = account.get("user_id", args.user_id)

            if not cookie:
                print(f"\n[{idx}/{len(accounts)}] 跳过: cookie为空")
                continue

            # 合并 WAF cookies
            cookie = merge_waf_cookies(cookie, waf_cookies)

            if not user_id:
                print(f"\n[{idx}/{len(accounts)}] 跳过: 未指定user_id")
                continue

            print(f"\n[{idx}/{len(accounts)}] 处理账号...")
            deleted = creator.batch_delete(
                cookie,
                str(user_id),
                prefix=args.delete_prefix,
                keyword=args.delete_keyword,
                token_ids=token_ids,
                delay=args.delay,
                dry_run=args.dry_run,
            )
            all_deleted.extend(deleted)

        print(f"\n总计删除: {len(all_deleted)} 个 token")
        return

    # 创建模式 (原有逻辑)
    token_config = {
        "remain_quota": args.quota,
        "unlimited_quota": args.unlimited,
        "expired_time": -1,
        "model_limits_enabled": False,
        "model_limits": "",
        "allow_ips": "",
        "group": "",
    }

    if args.config:
        try:
            config_data = json.loads(args.config)
            token_config.update(config_data)
        except json.JSONDecodeError as e:
            print(f"错误: 无法解析token配置 - {e}")
            sys.exit(1)

    for idx, account in enumerate(accounts, 1):
        cookie = account.get("cookie", "")
        user_id = account.get("user_id", args.user_id)
        prefix = account.get("prefix", args.prefix)
        count = account.get("count", args.count)

        if not cookie:
            print(f"\n[{idx}/{len(accounts)}] 跳过: cookie为空")
            continue

        # 合并 WAF cookies
        cookie = merge_waf_cookies(cookie, waf_cookies)

        if not user_id:
            print(f"\n[{idx}/{len(accounts)}] 跳过: 未指定user_id")
            continue

        print(f"\n[{idx}/{len(accounts)}] 处理账号...")
        creator.batch_create(cookie, str(user_id), prefix, count, args.delay)

    # 保存结果
    if creator.created_tokens:
        output_path = Path(args.output)
        output_path.write_text(
            json.dumps(creator.created_tokens, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\n已保存 {len(creator.created_tokens)} 个token到: {args.output}")

        # 输出纯key列表 (过滤空key)
        keys_file = output_path.with_suffix(".txt")
        valid_keys = [t["key"] for t in creator.created_tokens if t["key"]]
        keys_file.write_text("\n".join(valid_keys), encoding="utf-8")
        print(f"Token keys已保存到: {keys_file} ({len(valid_keys)} 个有效)")
    else:
        print("\n未创建任何token")


if __name__ == "__main__":
    asyncio.run(main())
