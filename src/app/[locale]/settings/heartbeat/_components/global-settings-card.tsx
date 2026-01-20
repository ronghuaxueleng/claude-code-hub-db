"use client";

import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface GlobalSettingsCardProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isLoading?: boolean;
}

export function GlobalSettingsCard({ enabled, onToggle, isLoading }: GlobalSettingsCardProps) {
  const t = useTranslations("settings.heartbeat");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("section.global.title")}</CardTitle>
        <CardDescription>{t("section.global.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enabled">{t("form.enabled.label")}</Label>
            <p className="text-sm text-muted-foreground">{t("form.enabled.description")}</p>
          </div>
          <Switch
            id="enabled"
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={isLoading}
          />
        </div>
      </CardContent>
    </Card>
  );
}
