"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { HeartbeatSettings } from "@/repository/heartbeat-settings";
import type {
  HeartbeatUrlConfig,
  CreateHeartbeatUrlConfigInput,
} from "@/repository/heartbeat-url-configs";
import { saveHeartbeatSettings } from "@/actions/heartbeat-settings";
import {
  createHeartbeatUrlConfigAction,
  updateHeartbeatUrlConfigAction,
  deleteHeartbeatUrlConfigAction,
} from "@/actions/heartbeat-url-configs";
import { GlobalSettingsCard } from "./global-settings-card";
import { UrlConfigsSection } from "./url-configs-section";
import { UrlConfigDialog } from "./url-config-dialog";

interface HeartbeatPageProps {
  settings: HeartbeatSettings;
  configs: HeartbeatUrlConfig[];
}

export function HeartbeatPage({
  settings: initialSettings,
  configs: initialConfigs,
}: HeartbeatPageProps) {
  const t = useTranslations("settings.heartbeat");
  const [settings, setSettings] = useState(initialSettings);
  const [configs, setConfigs] = useState(initialConfigs);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<HeartbeatUrlConfig | null>(null);

  // 切换全局开关
  const handleToggleEnabled = async (enabled: boolean) => {
    setIsLoading(true);
    try {
      const result = await saveHeartbeatSettings({ enabled });
      if (result.ok) {
        setSettings(result.data);
        toast.success(t("form.saveSuccess"));
      } else {
        toast.error(result.error || t("form.saveFailed"));
      }
    } catch (error) {
      toast.error(t("form.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // 打开新建对话框
  const handleCreate = () => {
    setEditingConfig(null);
    setDialogOpen(true);
  };

  // 打开编辑对话框
  const handleEdit = (config: HeartbeatUrlConfig) => {
    setEditingConfig(config);
    setDialogOpen(true);
  };

  // 复制配置
  const handleCopy = (config: HeartbeatUrlConfig) => {
    const copiedConfig = {
      ...config,
      name: `${config.name} - ${t("form.actions.copyLabel")}`,
    };
    setEditingConfig(copiedConfig as HeartbeatUrlConfig);
    setDialogOpen(true);
  };

  // 保存配置（新建或编辑）
  const handleSave = async (data: CreateHeartbeatUrlConfigInput) => {
    setIsLoading(true);
    try {
      if (editingConfig?.id) {
        // 编辑
        const result = await updateHeartbeatUrlConfigAction(editingConfig.id, data);
        if (result.ok) {
          setConfigs((prev) => prev.map((c) => (c.id === editingConfig.id ? result.data : c)));
          toast.success(t("form.saveSuccess"));
          setDialogOpen(false);
        } else {
          toast.error(result.error || t("form.saveFailed"));
        }
      } else {
        // 新建
        const result = await createHeartbeatUrlConfigAction(data);
        if (result.ok) {
          setConfigs((prev) => [...prev, result.data]);
          toast.success(t("form.saveSuccess"));
          setDialogOpen(false);
        } else {
          toast.error(result.error || t("form.saveFailed"));
        }
      }
    } catch (error) {
      toast.error(t("form.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // 删除配置
  const handleDelete = async (id: number) => {
    setIsLoading(true);
    try {
      const result = await deleteHeartbeatUrlConfigAction(id);
      if (result.ok) {
        setConfigs((prev) => prev.filter((c) => c.id !== id));
        toast.success(t("form.deleteSuccess"));
      } else {
        toast.error(result.error || t("form.deleteFailed"));
      }
    } catch (error) {
      toast.error(t("form.deleteFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // 切换配置启用状态
  const handleToggle = async (id: number, enabled: boolean) => {
    setIsLoading(true);
    try {
      const result = await updateHeartbeatUrlConfigAction(id, { isEnabled: enabled });
      if (result.ok) {
        setConfigs((prev) => prev.map((c) => (c.id === id ? result.data : c)));
        toast.success(t("form.saveSuccess"));
      } else {
        toast.error(result.error || t("form.saveFailed"));
      }
    } catch (error) {
      toast.error(t("form.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 全局设置 */}
      <GlobalSettingsCard
        enabled={settings.enabled}
        onToggle={handleToggleEnabled}
        isLoading={isLoading}
      />

      {/* URL配置列表 */}
      <UrlConfigsSection
        configs={configs}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggle={handleToggle}
        onCopy={handleCopy}
        onCreate={handleCreate}
        isLoading={isLoading}
      />

      {/* 新建/编辑对话框 */}
      <UrlConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={editingConfig}
        onSave={handleSave}
        isLoading={isLoading}
      />
    </div>
  );
}
