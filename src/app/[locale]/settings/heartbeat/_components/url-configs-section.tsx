"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import type { HeartbeatUrlConfig } from "@/repository/heartbeat-url-configs";
import { UrlConfigCard } from "./url-config-card";

interface UrlConfigsSectionProps {
  configs: HeartbeatUrlConfig[];
  onEdit: (config: HeartbeatUrlConfig) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
  onCopy: (config: HeartbeatUrlConfig) => void;
  onCreate: () => void;
  isLoading?: boolean;
}

export function UrlConfigsSection({
  configs,
  onEdit,
  onDelete,
  onToggle,
  onCopy,
  onCreate,
  isLoading,
}: UrlConfigsSectionProps) {
  const t = useTranslations("settings.heartbeat");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t("section.urlConfigs.title")}</CardTitle>
            <CardDescription>{t("section.urlConfigs.description")}</CardDescription>
          </div>
          <Button onClick={onCreate} disabled={isLoading}>
            <Plus className="mr-2 h-4 w-4" />
            {t("form.createButton")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t("form.noConfigs")}</p>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <UrlConfigCard
                key={config.id}
                config={config}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggle={onToggle}
                onCopy={onCopy}
                isLoading={isLoading}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
