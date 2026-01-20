"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { batchClearModelRedirects, batchSetModelRedirects } from "@/actions/providers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModelRedirectEditor } from "./model-redirect-editor";

interface BatchModelRedirectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProviderIds: number[];
  selectedProviderNames: string[];
}

export function BatchModelRedirectsDialog({
  open,
  onOpenChange,
  selectedProviderIds,
  selectedProviderNames,
}: BatchModelRedirectsDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("settings.providers.batch");
  const tCommon = useTranslations("settings.common");
  const [modelRedirects, setModelRedirects] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSet = async () => {
    if (Object.keys(modelRedirects).length === 0) {
      toast.error(t("modelRedirects.emptyRules"));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await batchSetModelRedirects(selectedProviderIds, modelRedirects);

      if (result.ok) {
        toast.success(t("modelRedirects.setSuccess"), {
          description: t("modelRedirects.setSuccessDesc", { count: result.data.updatedCount }),
        });
        queryClient.invalidateQueries({ queryKey: ["providers"] });
        router.refresh();
        onOpenChange(false);
        setModelRedirects({});
      } else {
        toast.error(t("modelRedirects.setFailed"), { description: result.error });
      }
    } catch (error) {
      toast.error(t("modelRedirects.setFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    setIsSubmitting(true);
    try {
      const result = await batchClearModelRedirects(selectedProviderIds);

      if (result.ok) {
        toast.success(t("modelRedirects.clearSuccess"), {
          description: t("modelRedirects.clearSuccessDesc", { count: result.data.updatedCount }),
        });
        queryClient.invalidateQueries({ queryKey: ["providers"] });
        router.refresh();
        onOpenChange(false);
        setModelRedirects({});
      } else {
        toast.error(t("modelRedirects.clearFailed"), { description: result.error });
      }
    } catch (error) {
      toast.error(t("modelRedirects.clearFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("modelRedirects.title")}</DialogTitle>
          <DialogDescription>
            {t("modelRedirects.description", { count: selectedProviderIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <div className="font-medium mb-2">{t("modelRedirects.selectedProviders")}:</div>
            <div className="flex flex-wrap gap-2">
              {selectedProviderNames.map((name, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div>
            <ModelRedirectEditor
              value={modelRedirects}
              onChange={setModelRedirects}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" onClick={handleClear} disabled={isSubmitting}>
            {t("modelRedirects.clearAll")}
          </Button>
          <Button onClick={handleSet} disabled={isSubmitting}>
            {t("modelRedirects.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
