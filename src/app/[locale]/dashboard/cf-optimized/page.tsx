import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getSystemSettings } from "@/repository/system-config";
import { CfOptimizationGlobalSwitch } from "./_components/cf-optimization-global-switch";
import { CfOptimizedDomainsTable } from "./_components/cf-optimized-domains-table";

export default async function CfOptimizedDomainsPage() {
  const t = await getTranslations("cfOptimizedDomains");
  const systemSettings = await getSystemSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      {/* 全局启用开关 */}
      <CfOptimizationGlobalSwitch initialEnabled={systemSettings.enableCfOptimization} />

      <Suspense fallback={<div>Loading...</div>}>
        <CfOptimizedDomainsTable />
      </Suspense>
    </div>
  );
}
