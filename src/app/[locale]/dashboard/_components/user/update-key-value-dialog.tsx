"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateKeyValue } from "@/actions/keys";
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
import { getErrorMessage } from "@/lib/utils/error-messages";

export interface UpdateKeyValueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyData: {
    id: number;
    name: string;
  };
  onSuccess?: () => void;
}

export function UpdateKeyValueDialog({
  open,
  onOpenChange,
  keyData,
  onSuccess,
}: UpdateKeyValueDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [newKeyValue, setNewKeyValue] = useState("");
  const [confirmKeyValue, setConfirmKeyValue] = useState("");
  const router = useRouter();
  const t = useTranslations("dashboard.userManagement.updateKeyValue");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证两次输入是否一致
    if (newKeyValue !== confirmKeyValue) {
      toast.error(t("mismatchError"));
      return;
    }

    // 基本验证
    if (!newKeyValue.trim()) {
      toast.error(t("emptyError"));
      return;
    }

    if (newKeyValue.length < 10 || newKeyValue.length > 500) {
      toast.error(t("lengthError"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await updateKeyValue(keyData.id, {
          newKey: newKeyValue,
        });

        if (!res.ok) {
          const msg = res.errorCode
            ? getErrorMessage(tErrors, res.errorCode, res.errorParams)
            : res.error || t("error");
          toast.error(msg);
          return;
        }

        toast.success(t("success"));
        setNewKeyValue("");
        setConfirmKeyValue("");
        onSuccess?.();
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("[UpdateKeyValueDialog] update failed", error);
        toast.error(t("error"));
      }
    });
  };

  const handleClose = () => {
    if (!isPending) {
      setNewKeyValue("");
      setConfirmKeyValue("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { keyName: keyData.name })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-key-value">{t("newKeyLabel")}</Label>
              <Input
                id="new-key-value"
                type="text"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder={t("newKeyPlaceholder")}
                disabled={isPending}
                required
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t("newKeyHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-key-value">{t("confirmKeyLabel")}</Label>
              <Input
                id="confirm-key-value"
                type="text"
                value={confirmKeyValue}
                onChange={(e) => setConfirmKeyValue(e.target.value)}
                placeholder={t("confirmKeyPlaceholder")}
                disabled={isPending}
                required
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t("confirmKeyHint")}</p>
            </div>

            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {t("warning")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon("loading") : t("confirmButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
