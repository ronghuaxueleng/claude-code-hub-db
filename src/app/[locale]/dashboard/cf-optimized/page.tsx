import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CfOptimizedDomainsTable } from "./_components/cf-optimized-domains-table";

export default async function CfOptimizedDomainsPage() {
  const t = await getTranslations("CfOptimizedDomains");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <CfOptimizedDomainsTable />
      </Suspense>
    </div>
  );
}
