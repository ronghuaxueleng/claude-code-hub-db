import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getHeartbeatSettings } from "@/repository/heartbeat-settings";
import { findAllHeartbeatUrlConfigs } from "@/repository/heartbeat-url-configs";
import { SettingsPageHeader } from "../_components/settings-page-header";
import { HeartbeatPage } from "./_components/heartbeat-page";
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
  const settings = await getHeartbeatSettings();
  const configs = await findAllHeartbeatUrlConfigs();

  return <HeartbeatPage settings={settings} configs={configs} />;
}
