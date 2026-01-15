"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Loader2, Zap } from "lucide-react";
import { createCfOptimizedDomainAction } from "@/actions/cf-optimized-domains";
import { testCfOptimizedIps } from "@/actions/cf-ip-test";
import { toast } from "sonner";

interface AddDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddDomainDialog({ open, onOpenChange, onSuccess }: AddDomainDialogProps) {
  const t = useTranslations("cfOptimizedDomains.addDialog");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [domain, setDomain] = useState("");
  const [ips, setIps] = useState("");
  const [description, setDescription] = useState("");

  async function handleTestSpeed() {
    if (!domain.trim()) {
      toast.error("请先输入域名");
      return;
    }

    setTesting(true);
    try {
      toast.info("正在测试 Cloudflare IP 速度，请稍候...");
      const results = await testCfOptimizedIps(domain.trim(), 1);

      if (results.length === 0) {
        toast.error("未找到可用的优选 IP");
        return;
      }

      // 将测试结果填入文本框
      const ipList = results.map((r) => `${r.ip} # ${r.avgLatency.toFixed(0)}ms`).join("\n");
      setIps(ipList);
      toast.success(`找到 ${results.length} 个优选 IP`);
    } catch (error) {
      console.error("Speed test failed:", error);
      toast.error("测速失败，请稍后重试");
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // 解析 IP 列表（支持逗号、换行分隔，忽略 # 后的注释）
      const ipList = ips
        .split(/[\n,]+/) // 先按换行或逗号分割
        .map((line) => line.split("#")[0].trim()) // 移除 # 及其后面的注释
        .filter((ip) => ip.length > 0 && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)); // 只保留有效的 IP 地址

      const result = await createCfOptimizedDomainAction({
        domain: domain.trim(),
        optimizedIps: ipList.length > 0 ? ipList : [],
        description: description.trim() || undefined,
      });

      if (result.ok) {
        toast.success(t("toast.success"));
        onSuccess();
        onOpenChange(false);
        // 重置表单
        setDomain("");
        setIps("");
        setDescription("");
      } else {
        toast.error(result.error || t("toast.error"));
      }
    } catch (error) {
      toast.error(t("toast.error"));
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="domain">{t("fields.domain.label")} *</Label>
              <Input
                id="domain"
                placeholder={t("fields.domain.placeholder")}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="ips">{t("fields.ips.label")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestSpeed}
                  disabled={testing || !domain.trim()}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      测速中...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      自动测速
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="ips"
                placeholder={t("fields.ips.placeholder")}
                value={ips}
                onChange={(e) => setIps(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                可选填。支持多个 IP，用逗号、空格或换行分隔。点击「自动测速」按钮可自动获取最优 IP。
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">{t("fields.description.label")}</Label>
              <Input
                id="description"
                placeholder={t("fields.description.placeholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t("buttons.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("buttons.submitting") : t("buttons.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
