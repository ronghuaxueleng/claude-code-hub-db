/**
 * Cloudflare 优选 IP Agent
 * 用于在代理请求时自动使用配置的优选 IP
 */

import { Agent } from "undici";
import { lookup as dnsLookup } from "node:dns";
import { promisify } from "node:util";
import { connect as tlsConnect } from "node:tls";
import { getOptimizedIp } from "./cf-optimized-ip-resolver";
import { logger } from "@/lib/logger";

const lookupAsync = promisify(dnsLookup);

export interface CfOptimizedAgentResult {
  agent: Agent;
  domain: string;
  ip: string;
}

/**
 * 创建支持 CF 优选 IP 的 Agent
 * @param targetUrl 目标 URL
 * @param options Agent 选项
 * @returns 配置了优选 IP 的 Agent 和 IP 信息，如果没有优选 IP 则返回 null
 */
export async function createCfOptimizedAgent(
  targetUrl: string,
  options: { allowH2?: boolean } = {}
): Promise<CfOptimizedAgentResult | null> {
  try {
    const url = new URL(targetUrl);
    const domain = url.hostname;

    // 获取优选 IP
    const optimizedIp = await getOptimizedIp(domain);

    if (!optimizedIp) {
      // 没有配置优选 IP
      return null;
    }

    logger.debug("[CfOptimizedAgent] Using optimized IP", {
      domain,
      ip: optimizedIp,
    });

    // 创建自定义 connect 函数，将域名解析到优选 IP
    const customConnect = function (opts: any, callback: any) {
      // 如果是目标域名，使用优选 IP
      if (opts.hostname === domain || opts.servername === domain) {
        logger.debug("[CfOptimizedAgent] Connecting to optimized IP", {
          originalHost: opts.hostname,
          optimizedIp,
          servername: domain,
        });

        // 使用 Node.js 原生 tls 模块创建连接
        const socket = tlsConnect({
          host: optimizedIp, // 连接到优选 IP
          port: opts.port || 443,
          servername: domain, // SNI 使用原域名
          rejectUnauthorized: true,
        });

        // 处理连接事件
        socket.once("secureConnect", () => {
          callback(null, socket);
        });

        socket.once("error", (err) => {
          callback(err, null);
        });

        return socket;
      }

      // 其他域名使用默认连接
      const socket = tlsConnect({
        host: opts.hostname,
        port: opts.port || 443,
        servername: opts.servername || opts.hostname,
        rejectUnauthorized: true,
      });

      socket.once("secureConnect", () => {
        callback(null, socket);
      });

      socket.once("error", (err) => {
        callback(err, null);
      });

      return socket;
    };

    // 创建带自定义 connect 的 Agent
    const agent = new Agent({
      ...options,
      connect: customConnect,
    });

    return {
      agent,
      domain,
      ip: optimizedIp,
    };
  } catch (error) {
    logger.error("[CfOptimizedAgent] Failed to create optimized agent:", error);
    return null;
  }
}
