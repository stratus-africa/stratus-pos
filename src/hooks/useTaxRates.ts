import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface TaxRate {
  id: string;
  business_id: string;
  name: string;
  rate: number;
  type: string;
  exempt_reason: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface TaxRateFormData {
  name: string;
  rate: number;
  type: string;
  exempt_reason?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export function useTaxRates() {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const key = ["tax_rates", business?.id];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("*")
        .eq("business_id", business!.id)
        .order("created_at");
      if (error) throw error;
      return data as TaxRate[];
    },
    enabled: !!business?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (form: TaxRateFormData) => {
      const { error } = await supabase.from("tax_rates").insert({
        business_id: business!.id,
        ...form,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Tax rate created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...form }: TaxRateFormData & { id: string }) => {
      const { error } = await supabase.from("tax_rates").update(form).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Tax rate updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tax_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Tax rate deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, createMutation, updateMutation, deleteMutation };
}
