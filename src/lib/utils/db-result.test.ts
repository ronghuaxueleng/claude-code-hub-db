import { describe, expect, test } from "vitest";
import { getAffectedRowCount } from "./db-result";

describe("getAffectedRowCount", () => {
  test("reads postgres.js count metadata", () => {
    expect(getAffectedRowCount({ count: 7 })).toBe(7);
    expect(getAffectedRowCount({ count: "12" })).toBe(12);
  });

  test("falls back to rowCount metadata", () => {
    expect(getAffectedRowCount({ rowCount: 3 })).toBe(3);
  });

  test("returns 0 when metadata is missing or invalid", () => {
    expect(getAffectedRowCount({})).toBe(0);
    expect(getAffectedRowCount({ count: null })).toBe(0);
    expect(getAffectedRowCount({ rowCount: "NaN" })).toBe(0);
  });
});
