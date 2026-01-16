"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { saveSystemSettings } from "@/actions/system-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe } from "lucide-react";

interface CfOptimizationGlobalSwitchProps {
  initialEnabled: boolean;
}

export function CfOptimizationGlobalSwitch({ initialEnabled }: CfOptimizationGlobalSwitchProps) {
  const t = useTranslations("cfOptimizedDomains.globalSwitch");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle(checked: boolean) {
    setEnabled(checked);

    startTransition(async () => {
      try {
        const result = await saveSystemSettings({
          enableCfOptimization: checked,
        });

        if (!result.ok) {
          setEnabled(!checked);
          toast.error(result.error || t("updateFailed"));
          return;
        }

        toast.success(checked ? t("enabled") : t("disabled"));
        router.refresh();
      } catch (error) {
        setEnabled(!checked);
        toast.error(t("updateFailed"));
        console.error("Failed to toggle CF optimization:", error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="cf-optimization-switch" className="text-base font-medium">
              {t("switchLabel")}
            </Label>
            <p className="text-sm text-muted-foreground">{t("switchDescription")}</p>
          </div>
          <Switch
            id="cf-optimization-switch"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
          />
        </div>
        {!enabled && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {t("disabledWarning")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
