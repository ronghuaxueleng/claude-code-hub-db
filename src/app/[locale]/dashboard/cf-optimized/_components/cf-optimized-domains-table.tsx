"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listCfOptimizedDomains } from "@/actions/cf-optimized-domains";
import type { CfOptimizedDomain } from "@/repository/cf-optimized-domains";
import { AddDomainDialog } from "./add-domain-dialog";
import { EditDomainDialog } from "./edit-domain-dialog";
import { DeleteDomainDialog } from "./delete-domain-dialog";

export function CfOptimizedDomainsTable() {
  const t = useTranslations("cfOptimizedDomains.table");
  const [domains, setDomains] = useState<CfOptimizedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<CfOptimizedDomain | null>(null);

  useEffect(() => {
    loadDomains();
  }, []);

  async function loadDomains() {
    setLoading(true);
    try {
      const data = await listCfOptimizedDomains();
      setDomains(data);
    } catch (error) {
      console.error("Failed to load domains:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(domain: CfOptimizedDomain) {
    setSelectedDomain(domain);
    setEditDialogOpen(true);
  }

  function handleDelete(domain: CfOptimizedDomain) {
    setSelectedDomain(domain);
    setDeleteDialogOpen(true);
  }

  if (loading) {
    return <div>{t("loading")}</div>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addButton")}
          </Button>
        </div>

        <div className="border rounded-lg">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left">{t("columns.domain")}</th>
                <th className="px-4 py-3 text-left">{t("columns.optimizedIps")}</th>
                <th className="px-4 py-3 text-left">{t("columns.status")}</th>
                <th className="px-4 py-3 text-left">{t("columns.description")}</th>
                <th className="px-4 py-3 text-right">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                domains.map((domain) => (
                  <tr key={domain.id} className="border-t">
                    <td className="px-4 py-3 font-mono">{domain.domain}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {domain.optimizedIps.map((ip, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                          >
                            {ip}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {domain.isEnabled ? (
                        <span className="text-green-600">{t("status.enabled")}</span>
                      ) : (
                        <span className="text-gray-400">{t("status.disabled")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {domain.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(domain)}>
                        {t("actions.edit")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(domain)}>
                        {t("actions.delete")}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddDomainDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={loadDomains}
      />

      <EditDomainDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={loadDomains}
        domain={selectedDomain}
      />

      <DeleteDomainDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={loadDomains}
        domain={selectedDomain}
      />
    </>
  );
}
