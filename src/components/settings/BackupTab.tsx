import { ChangeEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import {
  buildBackupPayload,
  buildBackupRestorePreview,
  downloadBackupFile,
  parseBackupFile,
  restoreBackupPayload,
  type BackupRestorePreview,
} from "@/lib/backup";
import { toast } from "sonner";
import { Download, Loader2, DatabaseBackup, Upload, ShieldAlert } from "lucide-react";

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
  const [restorePreview, setRestorePreview] = useState<BackupRestorePreview | null>(null);

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

  const handleRestoreSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!business?.id) {
      toast.error("No active business selected for restore.");
      event.target.value = "";
      return;
    }

    try {
      const payload = await parseBackupFile(selectedFile);
      const preview = buildBackupRestorePreview(payload, business.id);
      setRestorePreview(preview);
      toast.info(
        `Backup preview ready: ${preview.totalRows} rows across ${preview.tablesWithRows} tables. Review and confirm before restoring.`,
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Backup restoration failed.");
    } finally {
      event.target.value = "";
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restorePreview || !business?.id) {
      toast.error("No valid backup preview is ready to restore.");
      return;
    }

    const confirmed = window.confirm(
      `Restore ${restorePreview.totalRows} rows across ${restorePreview.tablesWithRows} tables into business ${business.name || business.id}?\n\n` +
        restorePreview.tableSummaries
          .filter(({ rowCount }) => rowCount > 0)
          .map(({ table, rowCount }) => `${table}: ${rowCount}`)
          .join("\n") +
        "\n\nThis will write data to Supabase.",
    );

    if (!confirmed) {
      toast.info("Restore cancelled before writing to Supabase.");
      return;
    }

    setIsImporting(true);

    try {
      const result = await restoreBackupPayload(restorePreview.payload, supabase, business.id);
      toast.success(
        `Backup restored successfully (${result.rowsRestored} rows across ${result.tablesRestored} tables).`,
      );
      setRestorePreview(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Backup restoration failed.");
    } finally {
      setIsImporting(false);
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
            onChange={handleRestoreSelection}
            disabled={!canExport || isImporting || isExporting}
            aria-label="Restore from backup file"
          />
          <p className="text-xs text-muted-foreground">
            Import a JSON backup created by this system to overwrite or rehydrate the current business records.
          </p>

          {restorePreview && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-4 w-4" />
                Restore preview
              </div>

              <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                <p>Target business: {restorePreview.targetBusinessId}</p>
                <p>Total rows to restore: {restorePreview.totalRows}</p>
                <p>Tables with rows: {restorePreview.tablesWithRows}</p>
              </div>

              <div className="max-h-48 overflow-auto rounded-md border bg-background/60 p-2">
                {restorePreview.tableSummaries.map(({ table, rowCount }) => (
                  <div key={table} className="flex items-center justify-between gap-3 py-1 text-xs">
                    <span className="font-mono">{table}</span>
                    <span className="rounded bg-muted px-2 py-0.5">{rowCount} rows</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setRestorePreview(null)}
                  disabled={isImporting}
                >
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleRestoreConfirm} disabled={isImporting} className="gap-2">
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isImporting ? "Restoring..." : "Proceed with restore"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
