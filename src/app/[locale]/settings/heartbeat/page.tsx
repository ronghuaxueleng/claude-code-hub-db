import { getTranslations } from "next-intl/server";
import { getHeartbeatSettings } from "@/repository/heartbeat-settings";
import { findAllHeartbeatUrlConfigs } from "@/repository/heartbeat-url-configs";
import { SettingsPageHeader } from "../_components/settings-page-header";
import { HeartbeatPage } from "./_components/heartbeat-page";

export const dynamic = "force-dynamic";

export default async function HeartbeatSettingsPage() {
  const t = await getTranslations("settings");
  const settings = await getHeartbeatSettings();
  const configs = await findAllHeartbeatUrlConfigs();

  return (
    <>
      <SettingsPageHeader title={t("heartbeat.title")} description={t("heartbeat.description")} />
      <HeartbeatPage settings={settings} configs={configs} />
    </>
  );
}
