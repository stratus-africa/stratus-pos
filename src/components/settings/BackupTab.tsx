import { ChangeEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { buildBackupPayload, downloadBackupFile, parseBackupFile, restoreBackupPayload } from "@/lib/backup";
import { toast } from "sonner";
import { Download, Loader2, DatabaseBackup, Upload } from "lucide-react";

const TABLES_TO_EXPORT = [
  "businesses",
  "locations",
  "products",
  "categories",
  "brands",
  "units",
  "customers",
  "suppliers",
  "sales",
  "sale_items",
  "payments",
  "purchases",
  "purchase_items",
  "inventory",
  "stock_adjustments",
  "bank_accounts",
  "bank_transactions",
  "expenses",
  "journal_entries",
  "journal_entry_lines",
  "audit_logs",
  "product_batches",
  "pos_sessions",
  "mpesa_transactions",
  "user_roles",
  "profiles",
] as const;

async function fetchTableRows(table: string, businessId: string) {
  const { data, error } = await supabase.from(table).select("*").eq("business_id", businessId);
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return data ?? [];
}

export function BackupTab() {
  const { business } = useBusiness();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const canExport = !!business?.id;

  const summary = useMemo(() => {
    if (!business?.id) return "No business selected.";
    return `Export all transactional and operational records for ${business.name}.`;
  }, [business]);

  const handleBackup = async () => {
    if (!business?.id) {
      toast.error("No active business selected for backup.");
      return;
    }

    setIsExporting(true);

    try {
      const tableEntries = await Promise.all(
        TABLES_TO_EXPORT.map(async (table) => {
          const rows = await fetchTableRows(table, business.id).catch((error) => {
            console.warn(`Skipping ${table} during backup export:`, error);
            return [] as unknown[];
          });
          return [table, rows] as const;
        }),
      );

      const payload = buildBackupPayload(business.id, Object.fromEntries(tableEntries));

      downloadBackupFile(payload);

      toast.success("Backup file generated successfully.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Backup generation failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!business?.id) {
      toast.error("No active business selected for restore.");
      event.target.value = "";
      return;
    }

    setIsImporting(true);

    try {
      const payload = await parseBackupFile(selectedFile);
      const result = await restoreBackupPayload(payload, supabase, business.id);
      toast.success(
        `Backup restored successfully (${result.rowsRestored} rows across ${result.tablesRestored} tables).`,
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Backup restoration failed.");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" />
          Business backup
        </CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This creates a complete JSON backup containing the business records and transaction history that can later be
          imported back into the system.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Includes sales, purchases, inventory, bank transactions, users, audit history, and other core business
          records.
        </div>

        <Button onClick={handleBackup} disabled={!canExport || isExporting || isImporting} className="gap-2">
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isExporting ? "Preparing backup..." : "Generate backup file"}
        </Button>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4" />
            Restore from backup file
          </div>
          <Input
            type="file"
            accept=".json,application/json"
            onChange={handleRestore}
            disabled={!canExport || isImporting || isExporting}
            aria-label="Restore from backup file"
          />
          <p className="text-xs text-muted-foreground">
            Import a JSON backup created by this system to overwrite or rehydrate the current business records.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
