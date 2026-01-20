"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { deleteCfOptimizedDomainAction } from "@/actions/cf-optimized-domains";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CfOptimizedDomain } from "@/repository/cf-optimized-domains";

interface DeleteDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  domain: CfOptimizedDomain | null;
}

export function DeleteDomainDialog({
  open,
  onOpenChange,
  onSuccess,
  domain,
}: DeleteDomainDialogProps) {
  const t = useTranslations("cfOptimizedDomains.deleteDialog");
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!domain) return;

    setLoading(true);

    try {
      const result = await deleteCfOptimizedDomainAction(domain.id);

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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("description")} <span className="font-mono font-semibold">{domain?.domain}</span>?
            <br />
            {t("warning")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("buttons.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? t("buttons.submitting") : t("buttons.submit")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
