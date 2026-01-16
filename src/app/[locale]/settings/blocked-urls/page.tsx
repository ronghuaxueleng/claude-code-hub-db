import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { fetchSystemSettings } from "@/actions/system-config";
import { Section } from "@/components/section";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPageHeader } from "../_components/settings-page-header";
import { BlockedUrlsForm } from "./_components/blocked-urls-form";

export const dynamic = "force-dynamic";

export default async function BlockedUrlsPage() {
  const t = await getTranslations("settings");

  return (
    <>
      <SettingsPageHeader
        title={t("blockedUrls.title")}
        description={t("blockedUrls.description")}
      />
      <Section
        title={t("blockedUrls.section.title")}
        description={t("blockedUrls.section.description")}
      >
        <Suspense fallback={<BlockedUrlsFormSkeleton />}>
          <BlockedUrlsFormContent />
        </Suspense>
      </Section>
    </>
  );
}

function BlockedUrlsFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-10 w-24" />
    </div>
  );
}

async function BlockedUrlsFormContent() {
  const result = await fetchSystemSettings();
  const blockedUrls = result.ok ? result.data.blockedUrls : [];
  return <BlockedUrlsForm initialUrls={blockedUrls} />;
}
