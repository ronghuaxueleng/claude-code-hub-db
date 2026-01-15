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
import { createCfOptimizedDomainAction } from "@/actions/cf-optimized-domains";
import { toast } from "sonner";

interface AddDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddDomainDialog({ open, onOpenChange, onSuccess }: AddDomainDialogProps) {
  const t = useTranslations("cfOptimizedDomains.addDialog");
  const [loading, setLoading] = useState(false);
  const [domain, setDomain] = useState("");
  const [ips, setIps] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // 解析 IP 列表（支持逗号、空格、换行分隔）
      const ipList = ips
        .split(/[,\s\n]+/)
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);

      if (ipList.length === 0) {
        toast.error(t("fields.ips.placeholder"));
        setLoading(false);
        return;
      }

      const result = await createCfOptimizedDomainAction({
        domain: domain.trim(),
        optimizedIps: ipList,
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
              <Label htmlFor="domain">
                {t("fields.domain.label")} *
              </Label>
              <Input
                id="domain"
                placeholder={t("fields.domain.placeholder")}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ips">
                {t("fields.ips.label")} *
              </Label>
              <Textarea
                id="ips"
                placeholder={t("fields.ips.placeholder")}
                value={ips}
                onChange={(e) => setIps(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">
                {t("fields.description.label")}
              </Label>
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
