import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface DigitaxSettings {
  id: string;
  business_id: string;
  enabled: boolean;
  environment: "sandbox" | "production";
  provider: string;
  api_key_last4: string | null;
  business_pin: string | null;
  branch_code: string | null;
  device_name: string | null;
  default_currency: string;
  default_invoice_type: string;
  connection_status: "unconfigured" | "connected" | "error" | "testing";
  last_sync_at: string | null;
  last_error: string | null;
  max_retry_attempts: number;
  mock_failure_rate: number;
}

export function useDigitaxSettings() {
  const { business } = useBusiness();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["digitax_settings", business?.id],
    queryFn: async () => {
      if (!business) return null;
      const { data, error } = await supabase
        .from("digitax_settings" as never)
        .select("*")
        .eq("business_id", business.id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data ?? null) as DigitaxSettings | null;
    },
    enabled: !!business,
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<DigitaxSettings>) => {
      if (!business) throw new Error("No business");
      const existing = query.data;
      if (existing) {
        const { error } = await supabase
          .from("digitax_settings" as never)
          .update(patch as never)
          .eq("business_id", business.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("digitax_settings" as never)
          .insert({ business_id: business.id, ...patch } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digitax_settings"] });
      toast.success("DigiTax settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testConnection = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("digitax-test-connection", {
        body: { provider: query.data?.provider ?? "mock" },
      });
      if (error) throw error;
      return data as { ok: boolean; message: string };
    },
    onSuccess: async (r) => {
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      if (business) {
        await supabase
          .from("digitax_settings" as never)
          .update({ connection_status: r.ok ? "connected" : "error", last_error: r.ok ? null : r.message } as never)
          .eq("business_id", business.id);
        qc.invalidateQueries({ queryKey: ["digitax_settings"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, save, testConnection };
}

export function useDigitaxQueue() {
  const { business } = useBusiness();
  return useQuery({
    queryKey: ["digitax_queue", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("digitax_invoice_queue" as never)
        .select("id, sale_id, invoice_type, status, retry_count, error_message, created_at, submitted_at, next_retry_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: !!business,
  });
}

export function useDigitaxLogs() {
  const { business } = useBusiness();
  return useQuery({
    queryKey: ["digitax_logs", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("digitax_logs" as never)
        .select("id, endpoint, http_status, execution_time_ms, sale_id, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: !!business,
  });
}

export async function submitSaleToDigitax(sale_id: string, opts: { wait?: boolean; invoice_type?: "invoice" | "credit_note"; original_sale_id?: string } = {}) {
  const { data, error } = await supabase.functions.invoke("digitax-submit", {
    body: { sale_id, ...opts },
  });
  if (error) throw error;
  return data as { queued_id?: string; skipped?: boolean; sale?: Record<string, unknown> };
}

export function useRetryDigitaxItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (queue_id: string) => {
      const { error } = await supabase
        .from("digitax_invoice_queue" as never)
        .update({ status: "pending", next_retry_at: new Date().toISOString() } as never)
        .eq("id", queue_id);
      if (error) throw error;
      await supabase.functions.invoke("digitax-process-queue", { body: { queue_id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digitax_queue"] });
      qc.invalidateQueries({ queryKey: ["digitax_logs"] });
      toast.success("Retry submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
