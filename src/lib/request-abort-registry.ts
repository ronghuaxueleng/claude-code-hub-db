/**
 * 全局请求中断注册表
 * 用于在同一进程内立即中断正在进行的请求
 */

import { logger } from "@/lib/logger";

// 全局注册表：sessionId:requestSequence -> AbortController
const activeRequests = new Map<string, AbortController>();

/**
 * 生成注册表 key
 */
function getKey(sessionId: string, requestSequence: number): string {
  return `${sessionId}:${requestSequence}`;
}

/**
 * 注册正在进行的请求
 */
export function registerRequest(
  sessionId: string,
  requestSequence: number,
  controller: AbortController
): void {
  const key = getKey(sessionId, requestSequence);
  activeRequests.set(key, controller);
  logger.debug("Request registered in abort registry", {
    sessionId,
    requestSequence,
    totalActive: activeRequests.size,
  });
}

/**
 * 取消注册（请求完成时调用）
 */
export function unregisterRequest(sessionId: string, requestSequence: number): void {
  const key = getKey(sessionId, requestSequence);
  const deleted = activeRequests.delete(key);
  if (deleted) {
    logger.debug("Request unregistered from abort registry", {
      sessionId,
      requestSequence,
      totalActive: activeRequests.size,
    });
  }
}

/**
 * 尝试中断请求（如果在当前进程中）
 * @returns true 如果找到并中断了请求，false 如果请求不在当前进程
 */
export function tryAbortRequest(sessionId: string, requestSequence: number): boolean {
  const key = getKey(sessionId, requestSequence);
  const controller = activeRequests.get(key);

  if (controller) {
    logger.info("Aborting request from registry (same process)", {
      sessionId,
      requestSequence,
    });
    controller.abort(new Error("Request cancelled by user"));
    activeRequests.delete(key);
    return true;
  }

  return false;
}

/**
 * 获取当前活跃请求数量（用于监控）
 */
export function getActiveRequestCount(): number {
  return activeRequests.size;
}
