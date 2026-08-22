import { supabase } from "@/integrations/supabase/client";

export type FinancePostingLine = {
  account_id: string;
  debit: number;
  credit: number;
  description?: string | null;
};

export type OperationalPostingInput = {
  sourceType: "sale" | "purchase" | "expense" | "banking" | "inventory" | string;
  sourceId: string;
  sourceNumber?: string | null;
  date: string;
  description: string;
  lines: FinancePostingLine[];
  idempotencyKey?: string | null;
};

/**
 * Creates the accounting journal for an operational transaction.
 *
 * The database validates:
 * - business ownership
 * - account ownership
 * - active accounts
 * - balanced debit/credit totals
 * - duplicate/idempotent posting
 * - accounting.journal.create permission
 *
 * Call this only after the operational transaction has successfully committed.
 */
export async function postOperationalJournal(input: OperationalPostingInput) {
  if (input.lines.length < 2) {
    throw new Error("At least two accounting lines are required.");
  }

  const debit = input.lines.reduce((n, line) => n + Number(line.debit || 0), 0);
  const credit = input.lines.reduce((n, line) => n + Number(line.credit || 0), 0);

  if (Math.round(debit * 100) !== Math.round(credit * 100)) {
    throw new Error(`Accounting journal is not balanced (${debit} vs ${credit}).`);
  }

  const { data, error } = await (supabase as any).rpc(
    "finance_post_operational_journal",
    {
      _source_type: input.sourceType,
      _source_id: input.sourceId,
      _source_number: input.sourceNumber ?? null,
      _date: input.date,
      _description: input.description,
      _lines: input.lines,
      _idempotency_key: input.idempotencyKey ?? null,
    },
  );

  if (error) throw error;
  return data as string;
}
