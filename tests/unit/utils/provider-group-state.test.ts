import { describe, expect, test } from "vitest";
import { isProviderEnabledForGroups } from "@/lib/utils/provider-group-state";

describe("provider group enabled state", () => {
  const provider = {
    isEnabled: true,
    groupTag: "alpha,beta",
    disabledGroups: ["alpha"],
  };

  test("a disabled group does not disable other groups", () => {
    expect(isProviderEnabledForGroups(provider, "alpha")).toBe(false);
    expect(isProviderEnabledForGroups(provider, "beta")).toBe(true);
  });

  test("route prefixes select only the matching group state", () => {
    expect(isProviderEnabledForGroups(provider, null, "alpha")).toBe(false);
    expect(isProviderEnabledForGroups(provider, null, "beta")).toBe(true);
  });

  test("wildcard access still requires an enabled provider group", () => {
    expect(isProviderEnabledForGroups(provider, "*")).toBe(true);
    expect(
      isProviderEnabledForGroups({ ...provider, disabledGroups: ["alpha", "beta"] }, "*")
    ).toBe(false);
  });

  test("global disable takes precedence over group state", () => {
    expect(isProviderEnabledForGroups({ ...provider, isEnabled: false }, "beta")).toBe(false);
  });

  test("providers without a group use the default group", () => {
    expect(isProviderEnabledForGroups({ isEnabled: true, groupTag: null }, "default")).toBe(true);
    expect(
      isProviderEnabledForGroups(
        { isEnabled: true, groupTag: null, disabledGroups: ["default"] },
        "default"
      )
    ).toBe(false);
  });
});
