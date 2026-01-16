"use client";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import type { CurrencyCode } from "@/lib/utils/currency";
import type { ProviderDisplay, ProviderStatisticsMap } from "@/types/provider";
import type { User } from "@/types/user";
import { ProviderRichListItem } from "./provider-rich-list-item";

interface ProviderListProps {
  providers: ProviderDisplay[];
  currentUser?: User;
  healthStatus: Record<
    number,
    {
      circuitState: "closed" | "open" | "half-open";
      failureCount: number;
      lastFailureTime: number | null;
      circuitOpenUntil: number | null;
      recoveryMinutes: number | null;
    }
  >;
  statistics?: ProviderStatisticsMap;
  statisticsLoading?: boolean;
  currencyCode?: CurrencyCode;
  enableMultiProviderTypes: boolean;
  selectedIds?: Set<number>;
  onSelectChange?: (id: number, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
}

export function ProviderList({
  providers,
  currentUser,
  healthStatus,
  statistics = {},
  statisticsLoading = false,
  currencyCode = "USD",
  enableMultiProviderTypes,
  selectedIds = new Set(),
  onSelectChange,
  onSelectAll,
}: ProviderListProps) {
  const t = useTranslations("settings.providers");
  const tBatch = useTranslations("settings.providers.batch");

  const isSelectMode = Boolean(onSelectChange && onSelectAll);
  const allSelected = providers.length > 0 && providers.every((p) => selectedIds.has(p.id));
  const someSelected = providers.some((p) => selectedIds.has(p.id)) && !allSelected;

  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <Globe className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-1">{t("noProviders")}</h3>
        <p className="text-sm text-muted-foreground text-center">{t("noProvidersDesc")}</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {isSelectMode && providers.length > 0 && onSelectAll && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
            aria-label={tBatch("selectAll")}
            className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
          />
          <span className="text-sm text-muted-foreground">
            {allSelected
              ? tBatch("allSelected", { count: providers.length })
              : someSelected
                ? tBatch("someSelected", { count: selectedIds.size })
                : tBatch("selectAll")}
          </span>
        </div>
      )}
      {providers.map((provider) => (
        <ProviderRichListItem
          key={provider.id}
          provider={provider}
          currentUser={currentUser}
          healthStatus={healthStatus[provider.id]}
          statistics={statistics[provider.id]}
          statisticsLoading={statisticsLoading}
          currencyCode={currencyCode}
          enableMultiProviderTypes={enableMultiProviderTypes}
          selected={selectedIds.has(provider.id)}
          onSelectChange={
            isSelectMode && onSelectChange
              ? (checked) => onSelectChange(provider.id, checked)
              : undefined
          }
        />
      ))}
    </div>
  );
}
