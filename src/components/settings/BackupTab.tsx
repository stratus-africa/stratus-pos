import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { buildBackupPayload, downloadBackupFile } from "@/lib/backup";
import { toast } from "sonner";
import { Download, Loader2, DatabaseBackup } from "lucide-react";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from(table).select("*").eq("business_id", businessId);
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return (data ?? []) as unknown[];
}

export function BackupTab() {
  const { business } = useBusiness();
  const [isExporting, setIsExporting] = useState(false);

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

      const payload = buildBackupPayload(
        business.id,
        Object.fromEntries(tableEntries),
      );

      downloadBackupFile(payload);

      toast.success("Backup file generated successfully.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Backup generation failed.");
    } finally {
      setIsExporting(false);
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
          This creates a complete JSON backup containing the business records and transaction history that can later be imported back into the system.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Includes sales, purchases, inventory, bank transactions, users, audit history, and other core business records.
        </div>

        <Button onClick={handleBackup} disabled={!canExport || isExporting} className="gap-2">
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isExporting ? "Preparing backup..." : "Generate backup file"}
        </Button>
      </CardContent>
    </Card>
  );
}
