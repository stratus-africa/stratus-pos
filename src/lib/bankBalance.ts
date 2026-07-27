/**
 * Pure helpers for bank balance derivation & reconciliation.
 * Mirrors the database logic (opening_balance + sum(signed transactions)).
 */

export type BankTxnType =
  | "payment_received"
  | "transfer_in"
  | "owner_deposit"
  | "loan_disbursement_received"
  | "payment_made"
  | "transfer_out"
  | "owner_withdrawal"
  | "expense"
  | string;

export interface SignedTxn {
  type: BankTxnType;
  amount: number;
}

const CREDIT_TYPES = new Set([
  "payment_received",
  "transfer_in",
  "owner_deposit",
  "loan_disbursement_received",
]);

/** Same rule as public.bank_txn_signed_amount(). */
export function signedAmount(type: BankTxnType, amount: number): number {
  const a = Number(amount) || 0;
  return CREDIT_TYPES.has(type) ? a : -a;
}

/** Derived balance = opening balance + sum of signed transactions. */
export function deriveBalance(openingBalance: number, txns: SignedTxn[]): number {
  return txns.reduce((sum, t) => sum + signedAmount(t.type, t.amount), Number(openingBalance) || 0);
}

export interface ReconciliationRow {
  bank_account_id: string;
  account_name: string;
  opening_balance: number;
  stored_balance: number;
  derived_balance: number;
  difference: number;
  transaction_count: number;
  is_mismatched: boolean;
  is_negative: boolean;
  allow_negative_balance: boolean;
}

/** Would this change push the account further into an invalid negative state? */
export function violatesNegativeGuard(
  balanceBefore: number,
  balanceAfter: number,
  allowNegative: boolean,
): boolean {
  if (allowNegative) return false;
  return balanceAfter < 0 && balanceAfter < balanceBefore;
}
