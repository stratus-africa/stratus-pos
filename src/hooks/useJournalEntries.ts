import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
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
}

export function useJournalEntries() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const qc = useQueryClient();

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
      if (!business || !user) throw new Error("Not authenticated");
      const totalDebit = input.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const totalCredit = input.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Debits (${totalDebit}) must equal credits (${totalCredit})`);
      }
      if (totalDebit === 0) throw new Error("Entry total cannot be zero");
      if (input.lines.length < 2) throw new Error("A journal entry needs at least two lines");

      const entryId = crypto.randomUUID();
      const { error: hErr } = await supabase.from("journal_entries").insert({
        id: entryId,
        business_id: business.id,
        date: input.date,
        reference: input.reference || null,
        description: input.description || null,
        total: totalDebit,
        created_by: user.id,
      });
      if (hErr) throw hErr;

      const { error: lErr } = await supabase.from("journal_entry_lines").insert(
        input.lines.map((l) => ({
          journal_entry_id: entryId,
          account_id: l.account_id,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description || null,
        }))
      );
      if (lErr) {
        await supabase.from("journal_entries").delete().eq("id", entryId);
        throw lErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast.success("Journal entry posted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("journal_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast.success("Journal entry deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { query, getLines, create, remove };
}

export function useUpdateOpeningBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opening_balance, opening_balance_date }: { id: string; opening_balance: number; opening_balance_date: string | null }) => {
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
