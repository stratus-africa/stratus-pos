import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface AccountingSettings {
  /** Start of the financial year / migration date the books begin from */
  migration_date: string | null;
  /** Financial year start (month-day driven, stored as a date) — legacy */
  financial_year_start: string | null;
  /** Financial year start month (1-12). January = 1 means Jan - Dec */
  financial_year_start_month: number;
  /** Date from which inventory quantities are considered live */
  inventory_start_date: string | null;
  /** Block posting documents dated before the migration date */
  lock_before_migration_date: boolean;
  /** Block stock movements dated before the inventory start date */
  lock_before_inventory_start: boolean;
  /** VAT posting per journal — enabled by default, switch off per journal */
  vat_posting: VatPostingSettings;
}

/** Journals that can post a separate VAT line. Missing/undefined = enabled. */
export interface VatPostingSettings {
  sales: boolean;
  purchases: boolean;
}

export const VAT_JOURNALS: { key: keyof VatPostingSettings; label: string; help: string }[] = [
  { key: "sales", label: "Sales journal", help: "Splits VAT charged on sales into the VAT Payable account." },
  { key: "purchases", label: "Purchases journal", help: "Splits input VAT on received purchases out of cost of goods sold." },
];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "January - December" style label for a financial year starting in `month` (1-12) */
export function financialYearLabel(month: number): string {
  const start = MONTH_NAMES[(month - 1 + 12) % 12];
  const end = MONTH_NAMES[(month + 10) % 12];
  return `${start} - ${end}`;
}

/** Resolved start/end dates of the financial year containing `ref` */
export function financialYearRange(month: number, ref: Date = new Date()) {
  const y = ref.getMonth() + 1 >= month ? ref.getFullYear() : ref.getFullYear() - 1;
  const start = new Date(y, month - 1, 1);
  const end = new Date(y + 1, month - 1, 0);
  return { start, end };
}

export const DEFAULT_ACCOUNTING_SETTINGS: AccountingSettings = {
  migration_date: null,
  financial_year_start: null,
  financial_year_start_month: 1,
  inventory_start_date: null,
  lock_before_migration_date: false,
  lock_before_inventory_start: false,
  vat_posting: { sales: true, purchases: true },
};


const KEY = "accounting";

export function useAccountingSettings() {
  const { business } = useBusiness();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["business_settings", business?.id, KEY],
    queryFn: async (): Promise<AccountingSettings> => {
      if (!business?.id) return DEFAULT_ACCOUNTING_SETTINGS;
      const { data, error } = await supabase
        .from("business_settings")
        .select("value")
        .eq("business_id", business.id)
        .eq("key", KEY)
        .maybeSingle();
      if (error) throw error;
      const value = (data?.value as Partial<AccountingSettings>) || {};
      return {
        ...DEFAULT_ACCOUNTING_SETTINGS,
        ...value,
        vat_posting: { ...DEFAULT_ACCOUNTING_SETTINGS.vat_posting, ...(value.vat_posting || {}) },
      };
    },
    enabled: !!business?.id,
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<AccountingSettings>) => {
      if (!business?.id) throw new Error("No business");
      const next = { ...(query.data || DEFAULT_ACCOUNTING_SETTINGS), ...patch };
      const { error } = await supabase
        .from("business_settings")
        .upsert(
          { business_id: business.id, key: KEY, value: next as never, updated_at: new Date().toISOString() },
          { onConflict: "business_id,key" },
        );
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["business_settings", business?.id, KEY] });
      toast.success("Accounting settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, save, settings: query.data || DEFAULT_ACCOUNTING_SETTINGS };
}
