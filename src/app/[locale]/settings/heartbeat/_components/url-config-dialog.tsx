"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { HeartbeatUrlConfig } from "@/repository/heartbeat-url-configs";
import type { CreateHeartbeatUrlConfigInput } from "@/repository/heartbeat-url-configs";

interface UrlConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: HeartbeatUrlConfig | null;
  onSave: (data: CreateHeartbeatUrlConfigInput) => Promise<void>;
  isLoading?: boolean;
}

export function UrlConfigDialog({
  open,
  onOpenChange,
  config,
  onSave,
  isLoading,
}: UrlConfigDialogProps) {
  const t = useTranslations("settings.heartbeat");
  const isEdit = !!config;

  const [formData, setFormData] = useState<CreateHeartbeatUrlConfigInput>({
    name: "",
    url: "",
    method: "POST",
    headers: {},
    body: null,
    intervalSeconds: 30,
    isEnabled: true,
  });

  const [headersText, setHeadersText] = useState("{}");
  const [headersError, setHeadersError] = useState("");

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name,
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        intervalSeconds: config.intervalSeconds,
        isEnabled: config.isEnabled,
      });
      setHeadersText(JSON.stringify(config.headers, null, 2));
    } else {
      setFormData({
        name: "",
        url: "",
        method: "POST",
        headers: {},
        body: null,
        intervalSeconds: 30,
        isEnabled: true,
      });
      setHeadersText("{}");
    }
    setHeadersError("");
  }, [config, open]);

  const handleHeadersChange = (value: string) => {
    setHeadersText(value);
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        setHeadersError(t("form.invalidHeaders"));
      } else {
        setHeadersError("");
        setFormData((prev) => ({ ...prev, headers: parsed }));
      }
    } catch {
      setHeadersError(t("form.invalidHeaders"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证
    if (!formData.name.trim()) {
      return;
    }
    if (!formData.url.trim()) {
      return;
    }
    if (headersError) {
      return;
    }
    if (
      !formData.intervalSeconds ||
      formData.intervalSeconds < 10 ||
      formData.intervalSeconds > 3600
    ) {
      return;
    }

    await onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("form.editDialogTitle") : t("form.createDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("section.urlConfigs.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 配置名称 */}
          <div className="space-y-2">
            <Label htmlFor="name">{t("form.name.label")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t("form.name.placeholder")}
              required
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">{t("form.url.label")}</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
              placeholder={t("form.url.placeholder")}
              required
            />
          </div>

          {/* HTTP方法 */}
          <div className="space-y-2">
            <Label htmlFor="method">{t("form.method.label")}</Label>
            <Select
              value={formData.method}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, method: value }))}
            >
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 请求头 */}
          <div className="space-y-2">
            <Label htmlFor="headers">{t("form.headers.label")}</Label>
            <Textarea
              id="headers"
              value={headersText}
              onChange={(e) => handleHeadersChange(e.target.value)}
              placeholder={t("form.headers.placeholder")}
              rows={4}
              className={headersError ? "border-red-500" : ""}
            />
            {headersError && <p className="text-sm text-red-500">{headersError}</p>}
          </div>

          {/* 请求体 */}
          <div className="space-y-2">
            <Label htmlFor="body">{t("form.body.label")}</Label>
            <Textarea
              id="body"
              value={formData.body || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, body: e.target.value || null }))}
              placeholder={t("form.body.placeholder")}
              rows={4}
            />
          </div>

          {/* 心跳间隔 */}
          <div className="space-y-2">
            <Label htmlFor="intervalSeconds">{t("form.intervalSeconds.label")}</Label>
            <Input
              id="intervalSeconds"
              type="number"
              min={10}
              max={3600}
              value={formData.intervalSeconds}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  intervalSeconds: Number.parseInt(e.target.value),
                }))
              }
              required
            />
            <p className="text-sm text-muted-foreground">{t("form.intervalSeconds.description")}</p>
          </div>

          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label htmlFor="isEnabled">{t("form.isEnabled.label")}</Label>
            <Switch
              id="isEnabled"
              checked={formData.isEnabled}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isEnabled: checked }))
              }
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("form.cancelButton")}
            </Button>
            <Button type="submit" disabled={isLoading || !!headersError}>
              {t("form.saveButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
