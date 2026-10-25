// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ProviderGroupStatus } from "@/app/[locale]/settings/providers/_components/provider-group-status";

const mocks = vi.hoisted(() => ({
  enable: vi.fn(),
  disable: vi.fn(),
  edit: vi.fn(),
  invalidate: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/actions/providers", () => ({
  batchEnableProviders: mocks.enable,
  batchDisableProviders: mocks.disable,
  editProvider: mocks.edit,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.group ? key + ":" + values.group : key,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

describe("provider group switches", () => {
  let container: HTMLDivElement;
  let root: Root;
  const provider = {
    id: 1,
    isEnabled: true,
    groupTag: "alpha,beta",
    disabledGroups: ["alpha"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enable.mockResolvedValue({ ok: true });
    mocks.disable.mockResolvedValue({ ok: true });
    mocks.edit.mockResolvedValue({ ok: true });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(selectedGroups: string[] = [], override = {}) {
    await act(async () => {
      root.render(
        <ProviderGroupStatus
          provider={{ ...provider, ...override }}
          selectedGroups={selectedGroups}
        />
      );
    });
  }

  async function click(label: string) {
    const button = container.querySelector<HTMLButtonElement>('[aria-label="' + label + '"]');
    expect(button).not.toBeNull();
    await act(async () => button?.click());
  }

  test("disabling beta affects beta only and refreshes cached providers", async () => {
    await render(["beta"]);
    await click("groupSwitch:beta");
    expect(mocks.disable).toHaveBeenCalledWith([1], ["beta"]);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["providers"] });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="globalStatus"]')).toBeNull();
  });

  test("enabling alpha does not change beta or the global switch", async () => {
    await render(["alpha"]);
    await click("groupSwitch:alpha");
    expect(mocks.enable).toHaveBeenCalledWith([1], ["alpha"]);
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  test("all view exposes separate global and per-group switches", async () => {
    await render();
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(3);
    await click("globalStatus");
    expect(mocks.edit).toHaveBeenCalledWith(1, { is_enabled: false });
    expect(mocks.disable).not.toHaveBeenCalled();
  });

  test("global disable prevents group switches from misleadingly enabling the provider", async () => {
    await render([], { isEnabled: false });
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="groupSwitch:alpha"]')?.disabled
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="groupSwitch:beta"]')?.disabled
    ).toBe(true);
  });

  test("a provider without group tags gets a default group switch", async () => {
    await render(["default"], { groupTag: null, disabledGroups: [] });
    await click("groupSwitch:default");
    expect(mocks.disable).toHaveBeenCalledWith([1], ["default"]);
  });

  test("action errors are shown without reporting success", async () => {
    mocks.disable.mockResolvedValue({ ok: false, error: "failed" });
    await render(["beta"]);
    await click("groupSwitch:beta");
    expect(mocks.error).toHaveBeenCalledWith("toggleFailed", { description: "failed" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  test("unexpected failures display the translated error", async () => {
    mocks.enable.mockRejectedValue(new Error("failed"));
    await render(["alpha"]);
    await click("groupSwitch:alpha");
    expect(mocks.error).toHaveBeenCalledWith("toggleFailed", { description: "deleteError" });
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
