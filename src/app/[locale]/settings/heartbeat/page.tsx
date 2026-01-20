import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Section } from "@/components/section";
import { getHeartbeatSettings } from "@/repository/heartbeat-settings";
import { SettingsPageHeader } from "../_components/settings-page-header";
import { HeartbeatForm } from "./_components/heartbeat-form";
import { HeartbeatSkeleton } from "./_components/heartbeat-skeleton";

export const dynamic = "force-dynamic";

export default async function HeartbeatSettingsPage() {
  const t = await getTranslations("settings");

  return (
    <>
      <SettingsPageHeader title={t("heartbeat.title")} description={t("heartbeat.description")} />
      <Suspense fallback={<HeartbeatSkeleton />}>
        <HeartbeatContent />
      </Suspense>
    </>
  );
}

async function HeartbeatContent() {
  const t = await getTranslations("settings");
  const settings = await getHeartbeatSettings();

  return (
    <Section
      title={t("heartbeat.section.config.title")}
      description={t("heartbeat.section.config.description")}
    >
      <HeartbeatForm settings={settings} />
    </Section>
  );
}
