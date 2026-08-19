import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { buildBackupPayload, downloadBackupFile, validateBackupPayload, type BackupPayload } from "@/lib/backup";
import { toast } from "sonner";
import { Download, Loader2, DatabaseBackup, Upload, TriangleAlert } from "lucide-react";

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
  if (table === "businesses") {
    const { data, error } = await supabase.from("businesses").select("*").eq("id", businessId);
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    return (data ?? []) as unknown[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from(table).select("*").eq("business_id", businessId);
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return (data ?? []) as unknown[];
}

export function BackupTab() {
  const { business } = useBusiness();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<BackupPayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !business?.id) return;

    try {
      const parsed = validateBackupPayload(JSON.parse(await file.text()));
      if (!parsed.valid) throw new Error(parsed.error);
      if (parsed.payload.businessId !== business.id) {
        throw new Error("This backup belongs to a different business and cannot be restored here.");
      }
      setRestoreFile(parsed.payload);
      toast.success("Backup validated. Review the record counts before restoring.");
    } catch (error) {
      setRestoreFile(null);
      toast.error(error instanceof Error ? error.message : "Unable to read backup file.");
    }
  };

  const handleRestore = async () => {
    if (!business?.id || !restoreFile) return;
    if (!window.confirm("Restore this backup? Existing records with the same IDs will be updated.")) return;

    setIsRestoring(true);
    try {
      const failures: string[] = [];
      for (const table of TABLES_TO_EXPORT) {
        const sourceRows = restoreFile.tables[table] ?? [];
        if (sourceRows.length === 0) continue;

        const rows = sourceRows.filter((row) => {
          if (table === "businesses") return (row as { id?: string }).id === business.id;
          return (row as { business_id?: string }).business_id === business.id;
        });
        if (rows.length === 0) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from(table).upsert(rows, { onConflict: "id" });
        if (error) failures.push(`${table}: ${error.message}`);
      }

      if (failures.length > 0) {
        throw new Error(`Some tables could not be restored:\n${failures.join("\n")}`);
      }

      setRestoreFile(null);
      toast.success("Backup restored successfully. Refreshing your data...");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup restore failed.");
    } finally {
      setIsRestoring(false);
    }
  };

  const restoreSummary = restoreFile ? Object.entries(restoreFile.tables).filter(([, rows]) => rows.length > 0) : [];

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

        <Button onClick={handleBackup} disabled={!canExport || isExporting} className="gap-2">
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isExporting ? "Preparing backup..." : "Generate backup file"}
        </Button>

        <div className="border-t pt-4 space-y-3">
          <div>
            <h3 className="font-medium">Restore from backup</h3>
            <p className="text-sm text-muted-foreground">
              Select a JSON backup created for this business. Matching record IDs will be updated.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileSelected}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canExport || isRestoring}
              className="gap-2"
            >
              <Upload className="h-4 w-4" /> Select backup file
            </Button>
            {restoreFile && (
              <Button onClick={handleRestore} disabled={isRestoring} className="gap-2">
                {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
                {isRestoring ? "Restoring..." : "Restore backup"}
              </Button>
            )}
          </div>
          {restoreFile && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <p className="font-medium">Backup from {new Date(restoreFile.exportedAt).toLocaleString()}</p>
              <p className="text-muted-foreground">
                {restoreSummary.length} tables, {restoreSummary.reduce((total, [, rows]) => total + rows.length, 0)}{" "}
                records
              </p>
              <div className="flex flex-wrap gap-1.5">
                {restoreSummary.map(([table, rows]) => (
                  <span key={table} className="rounded border px-2 py-1 text-xs">
                    {table}: {rows.length}
                  </span>
                ))}
              </div>
              <p className="flex items-start gap-2 text-xs text-amber-700">
                <TriangleAlert className="h-4 w-4 shrink-0" /> Restore updates matching IDs and may replace newer
                records.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
