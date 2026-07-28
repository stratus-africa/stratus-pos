import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Save, CalendarClock, Boxes, Check, ChevronsUpDown } from "lucide-react";
import {
  useAccountingSettings,
  financialYearLabel,
  financialYearRange,
  MONTH_NAMES,
  type AccountingSettings,
} from "@/hooks/useAccountingSettings";

export function AccountingTab() {
  const { query, save, settings } = useAccountingSettings();
  const [form, setForm] = useState<AccountingSettings>(settings);
  const [fyOpen, setFyOpen] = useState(false);
  const fyRange = useMemo(
    () => financialYearRange(form.financial_year_start_month || 1),
    [form.financial_year_start_month],
  );

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const set = <K extends keyof AccountingSettings>(k: K, v: AccountingSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const errors = useMemo(() => {
    const e: Partial<Record<"financial_year_start_month" | "migration_date" | "inventory_start_date", string>> = {};
    const m = form.financial_year_start_month;
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      e.financial_year_start_month =
        "Invalid financial year range. Pick a start month between January and December — the range always spans 12 months.";
    }
    const parse = (v: string | null) => (v ? new Date(v) : null);
    const mig = parse(form.migration_date);
    const inv = parse(form.inventory_start_date);
    if (form.migration_date && Number.isNaN(mig?.getTime())) e.migration_date = "Enter a valid migration date.";
    if (form.inventory_start_date && Number.isNaN(inv?.getTime())) e.inventory_start_date = "Enter a valid inventory start date.";
    if (mig && inv && !Number.isNaN(mig.getTime()) && !Number.isNaN(inv.getTime()) && inv < mig) {
      e.inventory_start_date = "Inventory start date cannot be before the migration date.";
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (mig && !Number.isNaN(mig.getTime()) && mig > today) {
      e.migration_date = "Migration date cannot be in the future.";
    }
    if (inv && !Number.isNaN(inv.getTime()) && inv > today) {
      e.inventory_start_date = "Inventory start date cannot be in the future.";
    }

    return e;
  }, [form]);

  const hasErrors = Object.keys(errors).length > 0;




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
                aria-invalid={!!errors.migration_date}
              />
              {errors.migration_date && (
                <p className="text-xs text-destructive">{errors.migration_date}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Financial Year Start</Label>
              <Popover open={fyOpen} onOpenChange={setFyOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={fyOpen}
                    className="w-full justify-between font-normal"
                  >
                    {financialYearLabel(form.financial_year_start_month || 1)}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search" />
                    <CommandList>
                      <CommandEmpty>No match.</CommandEmpty>
                      <CommandGroup>
                        {MONTH_NAMES.map((_, i) => {
                          const m = i + 1;
                          const label = financialYearLabel(m);
                          return (
                            <CommandItem
                              key={m}
                              value={label}
                              onSelect={() => {
                                set("financial_year_start_month", m);
                                setFyOpen(false);
                              }}
                            >
                              {label}
                              <Check
                                className={`ml-auto h-4 w-4 ${
                                  (form.financial_year_start_month || 1) === m ? "opacity-100" : "opacity-0"
                                }`}
                              />
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {errors.financial_year_start_month ? (
                <p className="text-xs text-destructive">{errors.financial_year_start_month}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Current year: {fyRange.start.toLocaleDateString()} – {fyRange.end.toLocaleDateString()}
                </p>
              )}
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
                aria-invalid={!!errors.inventory_start_date}
              />
              {errors.inventory_start_date && (
                <p className="text-xs text-destructive">{errors.inventory_start_date}</p>
              )}
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

      <div className="flex items-center justify-end gap-3">
        {hasErrors && (
          <p className="text-xs text-destructive">Fix the highlighted settings before saving.</p>
        )}
        <Button onClick={() => save.mutate(form)} disabled={save.isPending || hasErrors}>
          <Save className="mr-2 h-4 w-4" /> Save Accounting Settings
        </Button>
      </div>
    </div>
  );
}

export default AccountingTab;
