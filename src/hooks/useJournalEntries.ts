import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

export interface JournalEntry {
  id: string;
  business_id: string;
  entry_number: string | null;
  date: string;
  reference: string | null;
  description: string | null;
  total: number;
  status: string;
  created_by: string;
  created_at: string;
  submitted_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  posted_by?: string | null;
  posted_at?: string | null;
  reversed_by?: string | null;
  reversed_at?: string | null;
  reversal_of_id?: string | null;
  rejection_reason?: string | null;
}

export interface JournalEntryLine {
  id?: string;
  journal_entry_id?: string;
  account_id: string;
  debit: number;
  credit: number;
  description?: string | null;
  chart_of_accounts?: { code: string; name: string; type: string } | null;
}

export interface JournalEntryInput {
  date: string;
  reference?: string;
  description?: string;
  lines: { account_id: string; debit: number; credit: number; description?: string }[];
  submit?: boolean;
}

export function useJournalEntries() {
  const { business } = useBusiness();
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["journal_entries"] });

  const query = useQuery({
    queryKey: ["journal_entries", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("business_id", business.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as JournalEntry[];
    },
    enabled: !!business,
  });

  const getLines = async (entryId: string) => {
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("*, chart_of_accounts(code, name, type)")
      .eq("journal_entry_id", entryId)
      .order("created_at");
    if (error) throw error;
    return data as JournalEntryLine[];
  };

  const create = useMutation({
    mutationFn: async (input: JournalEntryInput) => {
      const { data, error } = await supabase.rpc("create_manual_journal" as any, {
        _date: input.date,
        _reference: input.reference || null,
        _description: input.description || null,
        _lines: input.lines,
        _submit: Boolean(input.submit),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, input) => {
      invalidate();
      toast.success(input.submit ? "Journal submitted for approval" : "Journal draft saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("delete_manual_journal" as any, { _journal_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Journal draft deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("submit_manual_journal" as any, { _journal_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Journal submitted for approval");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_manual_journal" as any, { _journal_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Journal approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase.rpc("reject_manual_journal" as any, {
        _journal_id: id,
        _reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Journal rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("post_manual_journal" as any, { _journal_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Journal posted to the ledger");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverse = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("reverse_manual_journal" as any, { _journal_id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Journal reversed with a new posted reversal entry");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, getLines, create, remove, submit, approve, reject, post, reverse };
}

export function useUpdateOpeningBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      opening_balance,
      opening_balance_date,
    }: {
      id: string;
      opening_balance: number;
      opening_balance_date: string | null;
    }) => {
      const { error } = await supabase
        .from("chart_of_accounts")
        .update({ opening_balance, opening_balance_date })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chart_of_accounts"] });
      toast.success("Opening balance updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
