"use client";

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
        toast.error("请至少输入一个 IP 地址");
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
        toast.success("更新成功");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(result.error || "更新失败");
      }
    } catch (error) {
      toast.error("更新失败");
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
            <DialogTitle>编辑优选域名</DialogTitle>
            <DialogDescription>修改域名配置和优选 IP 地址</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-domain">域名 *</Label>
              <Input
                id="edit-domain"
                placeholder="例如: api.anthropic.com"
                value={domainValue}
                onChange={(e) => setDomainValue(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-ips">优选 IP 地址 *</Label>
              <Textarea
                id="edit-ips"
                placeholder="输入一个或多个 IP 地址"
                value={ips}
                onChange={(e) => setIps(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">描述（可选）</Label>
              <Input
                id="edit-description"
                placeholder="例如: Claude API 优选 IP"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit-enabled">启用状态</Label>
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
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
