"use client";

import { useState } from "react";
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
        toast.error("请至少输入一个 IP 地址");
        setLoading(false);
        return;
      }

      const result = await createCfOptimizedDomainAction({
        domain: domain.trim(),
        optimizedIps: ipList,
        description: description.trim() || undefined,
      });

      if (result.ok) {
        toast.success("添加成功");
        onSuccess();
        onOpenChange(false);
        // 重置表单
        setDomain("");
        setIps("");
        setDescription("");
      } else {
        toast.error(result.error || "添加失败");
      }
    } catch (error) {
      toast.error("添加失败");
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
            <DialogTitle>添加优选域名</DialogTitle>
            <DialogDescription>
              配置域名和对应的 Cloudflare 优选 IP 地址
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="domain">域名 *</Label>
              <Input
                id="domain"
                placeholder="例如: api.anthropic.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ips">优选 IP 地址 *</Label>
              <Textarea
                id="ips"
                placeholder="输入一个或多个 IP 地址，用逗号、空格或换行分隔&#10;例如:&#10;104.21.48.123&#10;172.67.189.45"
                value={ips}
                onChange={(e) => setIps(e.target.value)}
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                支持多个 IP，用逗号、空格或换行分隔
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">描述（可选）</Label>
              <Input
                id="description"
                placeholder="例如: Claude API 优选 IP"
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
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
