import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { providers } from "@/drizzle/schema";
import { ProviderStatusGroupsSchema } from "@/lib/validation/schemas";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("@/drizzle/db", () => ({
  db: {
    update: () => ({
      set: mocks.set,
    }),
  },
}));
vi.mock("@/lib/cache/provider-cache", () => ({ getCachedProviders: vi.fn() }));
vi.mock("@/lib/config", () => ({ getEnvConfig: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: {} }));

import { batchUpdateProvidersEnabled } from "@/repository/provider";

describe("atomic provider group status updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.set.mockReturnValue({ where: () => ({ returning: mocks.returning }) });
    mocks.returning.mockResolvedValue([{ id: 1 }]);
  });

  test("global updates preserve group status", async () => {
    expect(await batchUpdateProvidersEnabled([1], false)).toBe(1);
    expect(mocks.set.mock.calls[0][0]).toEqual({
      isEnabled: false,
      updatedAt: expect.any(Date),
    });
  });

  test.each([
    false,
    true,
  ])("group update (enabled: %s) preserves the global switch", async (enabled) => {
    expect(await batchUpdateProvidersEnabled([1], enabled, ["alpha"])).toBe(1);
    const values = mocks.set.mock.calls[0][0];
    expect(values).not.toHaveProperty("isEnabled");
    // Compile the actual Drizzle expression, including bound group names.
    const query = drizzle.mock().update(providers).set(values).toSQL();
    expect(query.params).toContain('["alpha"]');
    expect(query.sql).toContain("disabled_groups");
    expect(query.sql).toContain("regexp_split_to_table");
    expect(query.sql).not.toContain('"is_enabled" =');
  });

  test("empty IDs perform no update", async () => {
    expect(await batchUpdateProvidersEnabled([], false, ["alpha"])).toBe(0);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  test("group validation does not turn malformed input into a global update", () => {
    expect(ProviderStatusGroupsSchema.parse([" alpha "])).toEqual(["alpha"]);
    expect(() => ProviderStatusGroupsSchema.parse([" "])).toThrow();
    expect(() => ProviderStatusGroupsSchema.parse("alpha")).toThrow();
    expect(() => ProviderStatusGroupsSchema.parse([42])).toThrow();
  });
});
