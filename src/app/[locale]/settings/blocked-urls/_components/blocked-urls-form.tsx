"use client";

import { AlertCircle, Info, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveSystemSettings } from "@/actions/system-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface BlockedUrlsFormProps {
  initialUrls: string[];
}

export function BlockedUrlsForm({ initialUrls }: BlockedUrlsFormProps) {
  const t = useTranslations("settings.blockedUrls");
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const validateUrl = (url: string): string | null => {
    if (!url.trim()) {
      return t("errors.empty");
    }
    if (!url.startsWith("/") && !url.startsWith("http://") && !url.startsWith("https://")) {
      return t("errors.invalidFormat");
    }
    if (urls.includes(url.trim())) {
      return t("errors.duplicate");
    }
    return null;
  };

  const handleAdd = () => {
    const trimmedUrl = newUrl.trim();
    const validationError = validateUrl(trimmedUrl);
    if (validationError) {
      setError(validationError);
      return;
    }
    setUrls([...urls, trimmedUrl]);
    setNewUrl("");
    setError(null);
  };

  const handleRemove = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveSystemSettings({ blockedUrls: urls });
      if (result.ok) {
        toast.success(t("saveSuccess"));
      } else {
        toast.error(result.error || t("errors.saveFailed"));
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Rules explanation */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium">{t("rules.title")}</p>
            <ul className="list-inside list-disc space-y-1">
              <li>{t("rules.pathMatch")}</li>
              <li>{t("rules.fullMatch")}</li>
              <li>{t("rules.response")}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Input section */}
      <div className="space-y-2">
        <Label htmlFor="blocked-url">{t("form.listLabel")}</Label>
        <p className="text-sm text-muted-foreground">{t("form.listHint")}</p>
        <div className="flex gap-2">
          <Input
            id="blocked-url"
            value={newUrl}
            onChange={(e) => {
              setNewUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("form.placeholder")}
            className="flex-1"
          />
          <Button type="button" onClick={handleAdd} variant="outline">
            <Plus className="mr-1 h-4 w-4" />
            {t("form.addButton")}
          </Button>
        </div>
        {error && (
          <div className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>

      {/* URL list */}
      <div className="space-y-2">
        {urls.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("form.emptyList")}
          </div>
        ) : (
          <div className="space-y-2">
            {urls.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
              >
                <code className="text-sm">{url}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(index)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? t("form.saving") : t("form.saveButton")}
        </Button>
      </div>
    </div>
  );
}
