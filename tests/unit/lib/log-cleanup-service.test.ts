import { describe, expect, test, vi } from "vitest";

function createLoggerMock() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  };
}

describe("log cleanup service", () => {
  test("uses postgres.js count metadata for deleted rows", async () => {
    vi.resetModules();

    const executeMock = vi
      .fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 0 });

    vi.doMock("@/drizzle/db", () => ({
      db: {
        execute: executeMock,
      },
    }));

    vi.doMock("@/lib/logger", () => ({
      logger: createLoggerMock(),
    }));

    const { cleanupLogs } = await import("@/lib/log-cleanup/service");

    const result = await cleanupLogs(
      {
        beforeDate: new Date("2026-01-01T00:00:00.000Z"),
      },
      {},
      { type: "manual", user: "admin" }
    );

    expect(result.totalDeleted).toBe(2);
    expect(result.batchCount).toBe(1);
    expect(result.error).toBeUndefined();
    expect(executeMock).toHaveBeenCalledTimes(2);
  });
});
