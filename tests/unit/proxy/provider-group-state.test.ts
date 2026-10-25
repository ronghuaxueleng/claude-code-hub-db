import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProxySession } from "@/app/v1/_lib/proxy/session";
import type { Provider } from "@/types/provider";

const mocks = vi.hoisted(() => ({
  findAllProviders: vi.fn(),
  getSessionFixedProvider: vi.fn(),
  getSessionProvider: vi.fn(),
  checkCostLimits: vi.fn(),
  checkTotalCostLimit: vi.fn(),
}));

vi.mock("@/repository/provider", () => ({ findAllProviders: mocks.findAllProviders }));
vi.mock("@/repository/system-config", () => ({ getSystemSettings: vi.fn() }));
vi.mock("@/lib/session-manager", () => ({
  SessionManager: {
    getSessionFixedProvider: mocks.getSessionFixedProvider,
    getSessionProvider: mocks.getSessionProvider,
  },
}));
vi.mock("@/lib/rate-limit", () => ({ RateLimitService: mocks }));
vi.mock("@/lib/circuit-breaker", () => ({
  isCircuitOpen: vi.fn(async () => false),
  getCircuitState: vi.fn(() => "closed"),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ProxyProviderResolver } from "@/app/v1/_lib/proxy/provider-selector";

const provider = {
  id: 1,
  name: "shared",
  isEnabled: true,
  groupTag: "alpha,beta",
  disabledGroups: ["alpha"],
  providerType: "openai-compatible",
  priority: 0,
  weight: 1,
  costMultiplier: 1,
  allowedModels: ["gpt-test"],
  circuitBreakerDisabled: true,
} as Provider;

function session(group: string | null, route: string | null = null) {
  return {
    sessionId: "test-session",
    authState: group ? { key: { providerGroup: group }, user: null } : null,
    originalFormat: "openai",
    getCurrentModel: () => "gpt-test",
    getRoutePrefix: () => route,
    getProvidersSnapshot: async () => [provider],
    getProviderById: async () => provider,
    shouldReuseProvider: () => true,
    clientRequestsContext1m: () => false,
  } as unknown as ProxySession;
}

// Exercise the real selection and reuse paths while replacing only external I/O.
const resolver = ProxyProviderResolver as unknown as {
  pickRandomProvider(
    session: ProxySession,
    excluded?: number[]
  ): Promise<{ provider: Provider | null }>;
  findReusable(session: ProxySession): Promise<Provider | null>;
};

describe("group-specific provider scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllProviders.mockResolvedValue([provider]);
    mocks.getSessionFixedProvider.mockResolvedValue(null);
    mocks.getSessionProvider.mockResolvedValue(provider.id);
    mocks.checkCostLimits.mockResolvedValue({ allowed: true });
    mocks.checkTotalCostLimit.mockResolvedValue({ allowed: true });
  });

  test.each([
    ["alpha", null, false],
    ["beta", null, true],
    ["alpha,beta", null, true],
    ["*", "alpha", false],
    ["*", "beta", true],
    ["alpha", "beta", false],
    [null, "alpha", false],
    [null, "beta", true],
  ] as const)("selection for group %s and route %s is enabled: %s", async (group, route, enabled) => {
    const result = await resolver.pickRandomProvider(session(group, route));
    expect(result.provider?.id ?? null).toBe(enabled ? provider.id : null);
  });

  test.each(["alpha", "beta"])("model listing respects group %s", async (group) => {
    const result = await ProxyProviderResolver.selectProviderByType(
      { user: { id: 1, providerGroup: "*" }, key: { providerGroup: group } },
      "openai-compatible"
    );
    expect(result.provider?.id ?? null).toBe(group === "beta" ? provider.id : null);
  });

  test.each([
    false,
    true,
  ])("existing session cannot bypass disabled group (fixed: %s)", async (fixed) => {
    mocks.getSessionFixedProvider.mockResolvedValue(fixed ? provider.id : null);
    expect(await resolver.findReusable(session("alpha"))).toBeNull();
    expect(mocks.checkCostLimits).not.toHaveBeenCalled();
    expect(await resolver.findReusable(session("beta"))).toBe(provider);
  });

  test("retry exclusion is still applied to a group-enabled provider", async () => {
    expect((await resolver.pickRandomProvider(session("beta"), [provider.id])).provider).toBeNull();
  });
});
