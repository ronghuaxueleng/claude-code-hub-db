"use client";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckSquare, Loader2, Search, Trash2, XSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  batchDeleteProviders,
  batchDisableProviders,
  batchEnableProviders,
} from "@/actions/providers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { CurrencyCode } from "@/lib/utils/currency";
import type { ProviderDisplay, ProviderStatisticsMap, ProviderType } from "@/types/provider";
import type { User } from "@/types/user";
import { ProviderList } from "./provider-list";
import { ProviderSortDropdown, type SortKey } from "./provider-sort-dropdown";
import { ProviderTypeFilter } from "./provider-type-filter";

interface ProviderManagerProps {
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
  loading?: boolean;
  refreshing?: boolean;
  addDialogSlot?: ReactNode;
}

export function ProviderManager({
  providers,
  currentUser,
  healthStatus,
  statistics = {},
  statisticsLoading = false,
  currencyCode = "USD",
  enableMultiProviderTypes,
  loading = false,
  refreshing = false,
  addDialogSlot,
}: ProviderManagerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("settings.providers.search");
  const tFilter = useTranslations("settings.providers.filter");
  const tCommon = useTranslations("settings.common");
  const tBatch = useTranslations("settings.providers.batch");
  const [typeFilter, setTypeFilter] = useState<ProviderType | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [batchEnablePending, startBatchEnable] = useTransition();
  const [batchDisablePending, startBatchDisable] = useTransition();
  const [batchDeletePending, startBatchDelete] = useTransition();

  const isBatchPending = batchEnablePending || batchDisablePending || batchDeletePending;

  // Status and group filters
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [circuitBrokenFilter, setCircuitBrokenFilter] = useState(false);

  // Count providers with circuit breaker open
  const circuitBrokenCount = useMemo(() => {
    return providers.filter((p) => healthStatus[p.id]?.circuitState === "open").length;
  }, [providers, healthStatus]);

  // Auto-reset circuit broken filter when no providers are broken
  useEffect(() => {
    if (circuitBrokenCount === 0 && circuitBrokenFilter) {
      setCircuitBrokenFilter(false);
    }
  }, [circuitBrokenCount, circuitBrokenFilter]);

  // Batch selection handlers
  const handleSelectChange = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredProviders.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleBatchEnable = () => {
    if (selectedIds.size === 0) return;

    startBatchEnable(async () => {
      try {
        const result = await batchEnableProviders(Array.from(selectedIds));
        if (result.ok) {
          toast.success(tBatch("enableSuccess"), {
            description: tBatch("enableSuccessDesc", { count: result.data.updatedCount }),
          });
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["providers"] });
          queryClient.invalidateQueries({ queryKey: ["providers-health"] });
          router.refresh();
        } else {
          toast.error(tBatch("enableFailed"), { description: result.error });
        }
      } catch (error) {
        console.error("Batch enable failed:", error);
        toast.error(tBatch("enableFailed"), { description: tBatch("unknownError") });
      }
    });
  };

  const handleBatchDisable = () => {
    if (selectedIds.size === 0) return;

    startBatchDisable(async () => {
      try {
        const result = await batchDisableProviders(Array.from(selectedIds));
        if (result.ok) {
          toast.success(tBatch("disableSuccess"), {
            description: tBatch("disableSuccessDesc", { count: result.data.updatedCount }),
          });
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["providers"] });
          queryClient.invalidateQueries({ queryKey: ["providers-health"] });
          router.refresh();
        } else {
          toast.error(tBatch("disableFailed"), { description: result.error });
        }
      } catch (error) {
        console.error("Batch disable failed:", error);
        toast.error(tBatch("disableFailed"), { description: tBatch("unknownError") });
      }
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;

    startBatchDelete(async () => {
      try {
        const result = await batchDeleteProviders(Array.from(selectedIds));
        if (result.ok) {
          toast.success(tBatch("deleteSuccess"), {
            description: tBatch("deleteSuccessDesc", { count: result.data.deletedCount }),
          });
          setSelectedIds(new Set());
          setShowDeleteDialog(false);
          queryClient.invalidateQueries({ queryKey: ["providers"] });
          queryClient.invalidateQueries({ queryKey: ["providers-health"] });
          router.refresh();
        } else {
          toast.error(tBatch("deleteFailed"), { description: result.error });
        }
      } catch (error) {
        console.error("Batch delete failed:", error);
        toast.error(tBatch("deleteFailed"), { description: tBatch("unknownError") });
      }
    });
  };

  // Extract unique groups from all providers
  const allGroups = useMemo(() => {
    const groups = new Set<string>();
    let hasDefaultGroup = false;
    providers.forEach((p) => {
      const tags = p.groupTag
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (!tags || tags.length === 0) {
        hasDefaultGroup = true;
      } else {
        tags.forEach((g) => groups.add(g));
      }
    });

    // Sort groups: "default" first, then alphabetically
    const sortedGroups = Array.from(groups).sort();
    if (hasDefaultGroup) {
      return ["default", ...sortedGroups];
    }
    return sortedGroups;
  }, [providers]);

  // 统一过滤逻辑：搜索 + 类型筛选 + 排序
  const filteredProviders = useMemo(() => {
    let result = providers;

    // 搜索过滤（name, url, groupTag - 支持匹配逗号分隔的单个标签）
    if (debouncedSearchTerm) {
      const term = debouncedSearchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.url.toLowerCase().includes(term) ||
          p.groupTag
            ?.split(",")
            .map((t) => t.trim().toLowerCase())
            .some((tag) => tag.includes(term))
      );
    }

    // 类型筛选
    if (typeFilter !== "all") {
      result = result.filter((p) => p.providerType === typeFilter);
    }

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((p) => (statusFilter === "active" ? p.isEnabled : !p.isEnabled));
    }

    // Filter by groups
    if (groupFilter.length > 0) {
      result = result.filter((p) => {
        const providerGroups =
          p.groupTag
            ?.split(",")
            .map((t) => t.trim())
            .filter(Boolean) || [];

        // If provider has no groups and "default" is selected, include it
        if (providerGroups.length === 0 && groupFilter.includes("default")) {
          return true;
        }

        return groupFilter.some((g) => providerGroups.includes(g));
      });
    }

    // Filter by circuit breaker state
    if (circuitBrokenFilter) {
      result = result.filter((p) => healthStatus[p.id]?.circuitState === "open");
    }

    // 排序
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "priority":
          // 优先级：数值越小越优先（1 > 2 > 3），升序排列
          return a.priority - b.priority;
        case "weight":
          // 权重：数值越大越优先，降序排列
          return b.weight - a.weight;
        case "actualPriority":
          // 实际选取顺序：先按优先级升序，再按权重降序
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          return b.weight - a.weight;
        case "createdAt": {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          return timeB - timeA;
        }
        default:
          return 0;
      }
    });
  }, [
    providers,
    debouncedSearchTerm,
    typeFilter,
    sortBy,
    statusFilter,
    groupFilter,
    circuitBrokenFilter,
    healthStatus,
  ]);

  return (
    <div className="space-y-4">
      {addDialogSlot ? <div className="flex justify-end">{addDialogSlot}</div> : null}

      {/* Batch operation toolbar */}
      {selectedIds.size > 0 && currentUser?.role === "admin" && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
          <span className="text-sm font-medium text-muted-foreground">
            {tBatch("selected", { count: selectedIds.size })}
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchEnable}
            disabled={isBatchPending}
            className="gap-2"
          >
            <CheckSquare className="h-4 w-4" />
            {tBatch("enable")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchDisable}
            disabled={isBatchPending}
            className="gap-2"
          >
            <XSquare className="h-4 w-4" />
            {tBatch("disable")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isBatchPending}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {tBatch("delete")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            disabled={isBatchPending}
          >
            {tBatch("cancel")}
          </Button>
        </div>
      )}

      {/* 筛选条件 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <ProviderTypeFilter value={typeFilter} onChange={setTypeFilter} disabled={loading} />

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as "all" | "active" | "inactive")}
            disabled={loading}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tFilter("status.all")}</SelectItem>
              <SelectItem value="active">{tFilter("status.active")}</SelectItem>
              <SelectItem value="inactive">{tFilter("status.inactive")}</SelectItem>
            </SelectContent>
          </Select>

          <ProviderSortDropdown value={sortBy} onChange={setSortBy} disabled={loading} />
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("placeholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              disabled={loading}
            />
          </div>
        </div>

        {/* Group filter */}
        {allGroups.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">{tFilter("groups.label")}</span>
            <Button
              variant={groupFilter.length === 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupFilter([])}
              disabled={loading}
              className="h-7"
            >
              {tFilter("groups.all")}
            </Button>
            {allGroups.map((group) => (
              <Button
                key={group}
                variant={groupFilter.includes(group) ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setGroupFilter((prev) =>
                    prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
                  );
                }}
                disabled={loading}
                className="h-7"
              >
                {group}
              </Button>
            ))}
          </div>
        )}
        {/* 搜索结果提示 + Circuit Breaker filter */}
        <div className="flex items-center justify-between">
          {debouncedSearchTerm ? (
            <p className="text-sm text-muted-foreground">
              {loading
                ? tCommon("loading")
                : filteredProviders.length > 0
                  ? t("found", { count: filteredProviders.length })
                  : t("notFound")}
            </p>
          ) : (
            <div className="text-sm text-muted-foreground">
              {loading
                ? tCommon("loading")
                : t("showing", { filtered: filteredProviders.length, total: providers.length })}
            </div>
          )}

          {/* Circuit Breaker toggle - only show if there are broken providers */}
          {circuitBrokenCount > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={`h-4 w-4 ${circuitBrokenFilter ? "text-destructive" : "text-muted-foreground"}`}
              />
              <Label
                htmlFor="circuit-broken-filter"
                className={`text-sm cursor-pointer select-none ${circuitBrokenFilter ? "text-destructive font-medium" : "text-muted-foreground"}`}
              >
                {tFilter("circuitBroken")}
              </Label>
              <Switch
                id="circuit-broken-filter"
                checked={circuitBrokenFilter}
                onCheckedChange={setCircuitBrokenFilter}
                disabled={loading}
              />
              <span
                className={`text-sm tabular-nums ${circuitBrokenFilter ? "text-destructive font-medium" : "text-muted-foreground"}`}
              >
                ({circuitBrokenCount})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 供应商列表 */}
      {loading && providers.length === 0 ? (
        <ProviderListSkeleton label={tCommon("loading")} />
      ) : (
        <div className="space-y-3">
          {refreshing ? <InlineLoading label={tCommon("loading")} /> : null}
          <ProviderList
            providers={filteredProviders}
            currentUser={currentUser}
            healthStatus={healthStatus}
            statistics={statistics}
            statisticsLoading={statisticsLoading}
            currencyCode={currencyCode}
            enableMultiProviderTypes={enableMultiProviderTypes}
            selectedIds={selectedIds}
            onSelectChange={currentUser?.role === "admin" ? handleSelectChange : undefined}
            onSelectAll={currentUser?.role === "admin" ? handleSelectAll : undefined}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tBatch("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tBatch("deleteConfirmDesc", { count: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeletePending}>{tBatch("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              disabled={batchDeletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchDeletePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tBatch("confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export type { ProviderDisplay } from "@/types/provider";

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function ProviderListSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <InlineLoading label={label} />
    </div>
  );
}
