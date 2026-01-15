"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { cfOptimizedDomains } from "@/drizzle/schema";

export interface CfOptimizedDomain {
  id: number;
  domain: string;
  optimizedIps: string[];
  isEnabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 获取所有启用的优选域名（用于代理层查询）
 */
export async function getActiveCfOptimizedDomains(): Promise<CfOptimizedDomain[]> {
  const results = await db.query.cfOptimizedDomains.findMany({
    where: eq(cfOptimizedDomains.isEnabled, true),
    orderBy: [cfOptimizedDomains.domain],
  });

  return results.map((r) => ({
    id: r.id,
    domain: r.domain,
    optimizedIps: r.optimizedIps,
    isEnabled: r.isEnabled,
    description: r.description,
    createdAt: r.createdAt ?? new Date(),
    updatedAt: r.updatedAt ?? new Date(),
  }));
}

/**
 * 根据域名查询优选 IP
 */
export async function getCfOptimizedIpsByDomain(domain: string): Promise<string[] | null> {
  const result = await db.query.cfOptimizedDomains.findFirst({
    where: eq(cfOptimizedDomains.domain, domain),
  });

  if (!result || !result.isEnabled) {
    return null;
  }

  return result.optimizedIps;
}

/**
 * 获取所有优选域名（包括禁用的）
 */
export async function getAllCfOptimizedDomains(): Promise<CfOptimizedDomain[]> {
  const results = await db.query.cfOptimizedDomains.findMany({
    orderBy: [desc(cfOptimizedDomains.createdAt)],
  });

  return results.map((r) => ({
    id: r.id,
    domain: r.domain,
    optimizedIps: r.optimizedIps,
    isEnabled: r.isEnabled,
    description: r.description,
    createdAt: r.createdAt ?? new Date(),
    updatedAt: r.updatedAt ?? new Date(),
  }));
}

/**
 * 创建优选域名
 */
export async function createCfOptimizedDomain(data: {
  domain: string;
  optimizedIps: string[];
  description?: string;
}): Promise<CfOptimizedDomain> {
  const [result] = await db
    .insert(cfOptimizedDomains)
    .values({
      domain: data.domain,
      optimizedIps: data.optimizedIps,
      description: data.description,
    })
    .returning();

  return {
    id: result.id,
    domain: result.domain,
    optimizedIps: result.optimizedIps,
    isEnabled: result.isEnabled,
    description: result.description,
    createdAt: result.createdAt ?? new Date(),
    updatedAt: result.updatedAt ?? new Date(),
  };
}

/**
 * 更新优选域名
 */
export async function updateCfOptimizedDomain(
  id: number,
  data: Partial<{
    domain: string;
    optimizedIps: string[];
    description: string;
    isEnabled: boolean;
  }>
): Promise<CfOptimizedDomain | null> {
  const [result] = await db
    .update(cfOptimizedDomains)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(cfOptimizedDomains.id, id))
    .returning();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    domain: result.domain,
    optimizedIps: result.optimizedIps,
    isEnabled: result.isEnabled,
    description: result.description,
    createdAt: result.createdAt ?? new Date(),
    updatedAt: result.updatedAt ?? new Date(),
  };
}

/**
 * 删除优选域名
 */
export async function deleteCfOptimizedDomain(id: number): Promise<boolean> {
  const result = await db
    .delete(cfOptimizedDomains)
    .where(eq(cfOptimizedDomains.id, id))
    .returning();

  return result.length > 0;
}
