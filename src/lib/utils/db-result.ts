interface AffectedRowResultLike {
  count?: unknown;
  rowCount?: unknown;
}

function toSafeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === "bigint") {
    return Math.max(0, Number(value));
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  return null;
}

/**
 * 统一提取 SQL 执行影响行数。
 *
 * postgres.js 使用 `count`，其他驱动/封装常见的是 `rowCount`。
 */
export function getAffectedRowCount(result: unknown): number {
  if (!result || typeof result !== "object") {
    return 0;
  }

  const { rowCount, count } = result as AffectedRowResultLike;

  return toSafeInteger(rowCount) ?? toSafeInteger(count) ?? 0;
}
