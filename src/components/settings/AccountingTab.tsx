import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, CalendarClock, Boxes } from "lucide-react";
import { useAccountingSettings, type AccountingSettings } from "@/hooks/useAccountingSettings";

export function AccountingTab() {
  const { query, save, settings } = useAccountingSettings();
  const [form, setForm] = useState<AccountingSettings>(settings);

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const set = <K extends keyof AccountingSettings>(k: K, v: AccountingSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Accounting</h2>
        <p className="text-sm text-muted-foreground">
          Define when your books and your stock records start, so historical data isn&apos;t mixed with live transactions.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Migration Date &amp; Financial Year
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The migration date is the day you started using the system. The financial year start is the first day of your
            current accounting year.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Migration Date</Label>
              <Input
                type="date"
                value={form.migration_date || ""}
                onChange={(e) => set("migration_date", e.target.value || null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Financial Year Start</Label>
              <Input
                type="date"
                value={form.financial_year_start || ""}
                onChange={(e) => set("financial_year_start", e.target.value || null)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Warn on entries before the migration date</p>
              <p className="text-xs text-muted-foreground">Flags documents dated before your books officially start.</p>
            </div>
            <Switch
              checked={form.lock_before_migration_date}
              onCheckedChange={(v) => set("lock_before_migration_date", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Inventory Start Date
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The date your opening stock quantities were counted. Purchases, sales and adjustments after this date build on
            top of the opening balances captured on each product.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Inventory Start Date</Label>
              <Input
                type="date"
                value={form.inventory_start_date || ""}
                onChange={(e) => set("inventory_start_date", e.target.value || null)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Warn on stock movements before the inventory start date</p>
              <p className="text-xs text-muted-foreground">Helps keep opening stock figures intact.</p>
            </div>
            <Switch
              checked={form.lock_before_inventory_start}
              onCheckedChange={(v) => set("lock_before_inventory_start", v)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Accounting Settings
        </Button>
      </div>
    </div>
  );
}

export default AccountingTab;
