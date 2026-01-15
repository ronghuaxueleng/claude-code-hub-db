"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { cfIpBlacklist } from "@/drizzle/schema";

export interface CfIpBlacklistEntry {
  id: number;
  domain: string;
  ip: string;
  failureCount: number;
  lastErrorType: string | null;
  lastErrorMessage: string | null;
  lastFailureAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 获取某个域名的黑名单 IP 列表（失败次数 >= 阈值）
 */
export async function getBlacklistedIps(
  domain: string,
  failureThreshold = 3
): Promise<string[]> {
  const results = await db.query.cfIpBlacklist.findMany({
    where: and(
      eq(cfIpBlacklist.domain, domain),
      gte(cfIpBlacklist.failureCount, failureThreshold)
    ),
    columns: {
      ip: true,
    },
  });

  return results.map((r) => r.ip);
}

/**
 * 记录 IP 失败（如果已存在则增加失败次数，否则创建新记录）
 */
export async function recordIpFailure(
  domain: string,
  ip: string,
  errorType?: string,
  errorMessage?: string
): Promise<void> {
  await db
    .insert(cfIpBlacklist)
    .values({
      domain,
      ip,
      failureCount: 1,
      lastErrorType: errorType || null,
      lastErrorMessage: errorMessage || null,
      lastFailureAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [cfIpBlacklist.domain, cfIpBlacklist.ip],
      set: {
        failureCount: sql`${cfIpBlacklist.failureCount} + 1`,
        lastErrorType: errorType || null,
        lastErrorMessage: errorMessage || null,
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      },
    });
}
