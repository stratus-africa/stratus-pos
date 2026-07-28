import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface AccountingSettings {
  /** Start of the financial year / migration date the books begin from */
  migration_date: string | null;
  /** Financial year start (month-day driven, stored as a date) */
  financial_year_start: string | null;
  /** Date from which inventory quantities are considered live */
  inventory_start_date: string | null;
  /** Block posting documents dated before the migration date */
  lock_before_migration_date: boolean;
  /** Block stock movements dated before the inventory start date */
  lock_before_inventory_start: boolean;
}

export const DEFAULT_ACCOUNTING_SETTINGS: AccountingSettings = {
  migration_date: null,
  financial_year_start: null,
  inventory_start_date: null,
  lock_before_migration_date: false,
  lock_before_inventory_start: false,
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
      return { ...DEFAULT_ACCOUNTING_SETTINGS, ...((data?.value as Partial<AccountingSettings>) || {}) };
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
