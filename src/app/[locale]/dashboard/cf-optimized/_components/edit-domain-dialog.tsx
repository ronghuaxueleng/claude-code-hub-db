"use client";

import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { updateCfOptimizedDomainAction } from "@/actions/cf-optimized-domains";
import type { CfOptimizedDomain } from "@/repository/cf-optimized-domains";
import { toast } from "sonner";

interface EditDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  domain: CfOptimizedDomain | null;
}

export function EditDomainDialog({ open, onOpenChange, onSuccess, domain }: EditDomainDialogProps) {
  const t = useTranslations("cfOptimizedDomains.editDialog");
  const [loading, setLoading] = useState(false);
  const [domainValue, setDomainValue] = useState("");
  const [ips, setIps] = useState("");
  const [description, setDescription] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    if (domain) {
      setDomainValue(domain.domain);
      setIps(domain.optimizedIps.join("\n"));
      setDescription(domain.description || "");
      setIsEnabled(domain.isEnabled);
    }
  }, [domain]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain) return;

    setLoading(true);

    try {
      const ipList = ips
        .split(/[,\s\n]+/)
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);

      if (ipList.length === 0) {
        toast.error(t("fields.ips.placeholder"));
        setLoading(false);
        return;
      }

      const result = await updateCfOptimizedDomainAction(domain.id, {
        domain: domainValue.trim(),
        optimizedIps: ipList,
        description: description.trim() || undefined,
        isEnabled,
      });

      if (result.ok) {
        toast.success(t("toast.success"));
        onSuccess();
        onOpenChange(false);
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
              <Label htmlFor="edit-domain">{t("fields.domain.label")} *</Label>
              <Input
                id="edit-domain"
                value={domainValue}
                onChange={(e) => setDomainValue(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-ips">{t("fields.ips.label")} *</Label>
              <Textarea
                id="edit-ips"
                placeholder={t("fields.ips.placeholder")}
                value={ips}
                onChange={(e) => setIps(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">{t("fields.description.label")}</Label>
              <Input
                id="edit-description"
                placeholder={t("fields.description.placeholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit-enabled">{t("fields.enabled.label")}</Label>
              <Switch id="edit-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
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
