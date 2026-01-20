"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveHeartbeatSettings } from "@/actions/heartbeat-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { HeartbeatSettings } from "@/repository/heartbeat-settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, CheckCircle2 } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HeartbeatFormProps {
  settings: HeartbeatSettings;
}

export function HeartbeatForm({ settings }: HeartbeatFormProps) {
  const router = useRouter();
  const t = useTranslations("settings.heartbeat.form");
  const tCommon = useTranslations("settings.common");

  const [enabled, setEnabled] = useState(settings.enabled);
  const [intervalSeconds, setIntervalSeconds] = useState(settings.intervalSeconds);
  const [selectedCurlIndex, setSelectedCurlIndex] = useState<number | null>(
    settings.selectedCurlIndex
  );
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  // 获取所有不同的模型
  const allModels = Array.from(
    new Set(settings.savedCurls.map((curl) => curl.model).filter(Boolean))
  ) as string[];

  // 根据模型筛选curl列表
  const filteredCurls = settings.savedCurls.filter((curl) => {
    if (modelFilter === "all") return true;
    return curl.model === modelFilter;
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // 验证间隔时间
    if (intervalSeconds < 10 || intervalSeconds > 3600) {
      toast.error(t("intervalOutOfRange"));
      return;
    }

    // 如果启用了心跳但没有选择curl
    if (enabled && selectedCurlIndex === null && settings.savedCurls.length > 0) {
      toast.error(t("noCurlSelected"));
      return;
    }

    startTransition(async () => {
      const result = await saveHeartbeatSettings({
        enabled,
        intervalSeconds,
        selectedCurlIndex,
      });

      if (!result.ok) {
        toast.error(result.error || t("saveFailed"));
        return;
      }

      toast.success(t("saveSuccess"));
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertDescription>{t("description")}</AlertDescription>
      </Alert>

      {/* 启用开关 */}
      <div className="flex items-center justify-between space-x-2">
        <div className="space-y-0.5">
          <Label htmlFor="enabled">{t("enabled.label")}</Label>
          <p className="text-sm text-muted-foreground">{t("enabled.description")}</p>
        </div>
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} disabled={isPending} />
      </div>

      {/* 心跳间隔 */}
      <div className="space-y-2">
        <Label htmlFor="intervalSeconds">{t("intervalSeconds.label")}</Label>
        <Input
          id="intervalSeconds"
          type="number"
          min={10}
          max={3600}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number.parseInt(e.target.value))}
          disabled={isPending}
        />
        <p className="text-sm text-muted-foreground">{t("intervalSeconds.description")}</p>
      </div>

      {/* 保存的 curl 命令列表 */}
      {settings.savedCurls.length > 0 && (
        <div className="space-y-2">
          <Label>{t("savedCurls.label")}</Label>
          <p className="text-sm text-muted-foreground">{t("savedCurls.description")}</p>

          {/* 模型筛选 */}
          {allModels.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="modelFilter" className="whitespace-nowrap">
                {t("modelFilter.label")}
              </Label>
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger id="modelFilter" className="w-[300px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("modelFilter.all")}</SelectItem>
                  {allModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <RadioGroup
            value={selectedCurlIndex?.toString() ?? ""}
            onValueChange={(value) => setSelectedCurlIndex(value ? Number.parseInt(value) : null)}
            disabled={isPending}
            className="space-y-3"
          >
            {filteredCurls.map((curl, filteredIndex) => {
              // 找到原始索引
              const originalIndex = settings.savedCurls.indexOf(curl);
              return (
                <div
                  key={originalIndex}
                  className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50"
                >
                  <RadioGroupItem
                    value={originalIndex.toString()}
                    id={`curl-${originalIndex}`}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`curl-${originalIndex}`}
                        className="cursor-pointer font-medium"
                      >
                        {curl.providerName}
                      </Label>
                      {selectedCurlIndex === originalIndex && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>端点: {curl.endpoint}</div>
                      {curl.model && <div>模型: {curl.model}</div>}
                      <div>时间: {new Date(curl.timestamp).toLocaleString("zh-CN")}</div>
                    </div>
                    <Textarea
                      value={curl.curl}
                      readOnly
                      className="font-mono text-xs h-32 resize-none"
                    />
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        </div>
      )}

      {settings.savedCurls.length === 0 && (
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>{t("noCurls")}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
