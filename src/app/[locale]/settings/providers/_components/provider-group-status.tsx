"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { batchDisableProviders, batchEnableProviders, editProvider } from "@/actions/providers";
import { Switch } from "@/components/ui/switch";
import { getProviderGroups } from "@/lib/utils/provider-group-state";
import type { ProviderDisplay } from "@/types/provider";

interface ProviderGroupStatusProps {
  provider: Pick<ProviderDisplay, "id" | "isEnabled" | "groupTag" | "disabledGroups">;
  selectedGroups: string[];
}

export function ProviderGroupStatus({ provider, selectedGroups }: ProviderGroupStatusProps) {
  const t = useTranslations("settings.providers.list");
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const groups = getProviderGroups(provider).filter(
    (group) => selectedGroups.length === 0 || selectedGroups.includes(group)
  );

  const toggle = (next: boolean, group: string | null) => {
    startTransition(async () => {
      try {
        const result =
          group === null
            ? await editProvider(provider.id, { is_enabled: next })
            : await (next ? batchEnableProviders : batchDisableProviders)([provider.id], [group]);
        if (!result.ok) {
          toast.error(t("toggleFailed"), { description: result.error });
          return;
        }
        const status = next ? t("statusEnabled") : t("statusDisabled");
        toast.success(
          group === null ? t("toggleSuccess", { status }) : t("groupStatus", { group, status })
        );
        queryClient.invalidateQueries({ queryKey: ["providers"] });
        queryClient.invalidateQueries({ queryKey: ["providers-health"] });
        router.refresh();
      } catch {
        toast.error(t("toggleFailed"), { description: t("deleteError") });
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedGroups.length === 0 && (
        <label className="flex items-center gap-1 text-xs">
          {t("globalStatus")}
          <Switch
            aria-label={t("globalStatus")}
            checked={provider.isEnabled}
            onCheckedChange={(next) => toggle(next, null)}
            disabled={pending}
          />
        </label>
      )}
      {groups.map((group) => (
        <label key={group} className="flex items-center gap-1 text-xs">
          {group}
          <Switch
            aria-label={t("groupSwitch", { group })}
            checked={provider.isEnabled && !provider.disabledGroups?.includes(group)}
            onCheckedChange={(next) => toggle(next, group)}
            disabled={pending || !provider.isEnabled}
            title={!provider.isEnabled ? t("globalDisabled") : undefined}
            className="data-[state=checked]:bg-green-500"
          />
        </label>
      ))}
    </div>
  );
}
