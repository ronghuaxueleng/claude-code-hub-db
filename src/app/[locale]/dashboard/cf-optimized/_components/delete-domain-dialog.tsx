"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteCfOptimizedDomainAction } from "@/actions/cf-optimized-domains";
import type { CfOptimizedDomain } from "@/repository/cf-optimized-domains";
import { toast } from "sonner";

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
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!domain) return;

    setLoading(true);

    try {
      const result = await deleteCfOptimizedDomainAction(domain.id);

      if (result.ok) {
        toast.success("删除成功");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(result.error || "删除失败");
      }
    } catch (error) {
      toast.error("删除失败");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除域名 <span className="font-mono font-semibold">{domain?.domain}</span>{" "}
            的优选配置吗？
            <br />
            此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "删除中..." : "删除"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
