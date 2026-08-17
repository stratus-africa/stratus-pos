import { describe, expect, it } from "vitest";
import {
  assertAccountingConfig,
  isBalancedJournal,
  validateJournalLines,
  type LedgerLine,
} from "@/lib/accounting-ledger";

describe("general ledger validation", () => {
  it("accepts balanced double-entry journal lines", () => {
    const lines: LedgerLine[] = [
      { accountId: "cash", debit: 116000, credit: 0, description: "Sale receipt" },
      { accountId: "sales_revenue", debit: 0, credit: 100000, description: "Revenue" },
      { accountId: "vat_payable", debit: 0, credit: 16000, description: "VAT" },
    ];

    expect(validateJournalLines(lines)).toMatchObject({ valid: true, totalDebit: 116000, totalCredit: 116000 });
  });

  it("rejects unbalanced or invalid lines", () => {
    const invalid: LedgerLine[] = [
      { accountId: "cash", debit: 100, credit: 0 },
      { accountId: "sales_revenue", debit: 0, credit: 50 },
    ];

    const outcome = validateJournalLines(invalid);
    expect(outcome.valid).toBe(false);
    expect(outcome.error).toMatch(/balanced/i);
  });

  it("blocks posting when required mapping is missing", () => {
    const config = {
      sales_revenue: "acct-1",
      cogs: null,
      inventory: "acct-2",
      accounts_receivable: "acct-3",
      accounts_payable: "acct-4",
      cash: "acct-5",
      vat_payable: "acct-6",
      input_vat: "acct-7",
    } as Record<string, string | null>;

    expect(() => assertAccountingConfig(config, ["sales_revenue", "cogs", "inventory", "vat_payable"])).toThrow(
      /Accounting configuration incomplete/i,
    );
  });

  it("treats a ledger as balanced when the sum of debits equals credits", () => {
    expect(
      isBalancedJournal([
        { debit: 30000, credit: 0 },
        { debit: 0, credit: 30000 },
      ]),
    ).toBe(true);
  });
});
