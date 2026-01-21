import { getTranslations } from "next-intl/server";
import { Section } from "@/components/section";
import { getHeartbeatSettings } from "@/repository/heartbeat-settings";
import { SettingsPageHeader } from "../_components/settings-page-header";

export const dynamic = "force-dynamic";

export default async function HeartbeatSettingsPage() {
  const t = await getTranslations("settings");
  const settings = await getHeartbeatSettings();

  return (
    <>
      <SettingsPageHeader title={t("heartbeat.title")} description={t("heartbeat.description")} />
      <Section
        title={t("heartbeat.section.global.title")}
        description={t("heartbeat.section.global.description")}
      >
        <div className="text-sm text-muted-foreground">心跳配置功能重构中，前端UI待实现...</div>
        <pre className="mt-4 rounded-md bg-muted p-4 text-xs">
          {JSON.stringify(settings, null, 2)}
        </pre>
      </Section>
    </>
  );
}
