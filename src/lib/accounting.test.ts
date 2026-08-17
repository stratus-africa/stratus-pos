import { describe, expect, it } from "vitest";
import {
  buildPurchaseJournal,
  buildSaleJournal,
  validateJournalLines,
  requireMapping,
} from "./accounting";

describe("accounting journal validation", () => {
  it("accepts a balanced sale journal", () => {
    const lines = [
      { accountId: "cash", debit: 116000, description: "Cash" },
      { accountId: "sales_revenue", credit: 100000, description: "Revenue" },
      { accountId: "vat_payable", credit: 16000, description: "VAT" },
    ];

    expect(() => validateJournalLines(lines)).not.toThrow();
    expect(lines.reduce((sum, line) => sum + (line.debit ?? 0), 0)).toBe(116000);
  });

  it("rejects an unbalanced journal", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "cash", debit: 1000, description: "Cash" },
        { accountId: "sales_revenue", credit: 900, description: "Revenue" },
      ]),
    ).toThrow(/balanced/i);
  });

  it("builds a correct cash sale journal with COGS and inventory relief", () => {
    const journal = buildSaleJournal({
      cashAccountId: "cash",
      receivableAccountId: "ar",
      revenueAccountId: "sales_revenue",
      vatAccountId: "vat_payable",
      cogsAccountId: "cogs",
      inventoryAccountId: "inventory",
      grossAmount: 116000,
      revenueNet: 100000,
      vatAmount: 16000,
      cogsAmount: 60000,
    });

    expect(journal).toEqual([
      { accountId: "cash", debit: 116000, description: "Cash / Accounts Receivable" },
      { accountId: "sales_revenue", credit: 100000, description: "Sales revenue" },
      { accountId: "vat_payable", credit: 16000, description: "Output VAT" },
      { accountId: "cogs", debit: 60000, description: "Cost of goods sold" },
      { accountId: "inventory", credit: 60000, description: "Inventory relief" },
    ]);
  });

  it("builds a purchase journal to inventory and input VAT", () => {
    const journal = buildPurchaseJournal({
      inventoryAccountId: "inventory",
      inputVatAccountId: "input_vat",
      payablesAccountId: "ap",
      inventoryAmount: 100000,
      inputVatAmount: 16000,
      payableAmount: 116000,
    });

    expect(journal).toEqual([
      { accountId: "inventory", debit: 100000, description: "Inventory purchase" },
      { accountId: "input_vat", debit: 16000, description: "Input VAT" },
      { accountId: "ap", credit: 116000, description: "Accounts payable" },
    ]);
  });

  it("requires a configured mapping before posting", () => {
    expect(() => requireMapping({ sales_revenue: undefined }, "sales_revenue", "Sales Revenue")).toThrow(
      /Sales Revenue.*configured/i,
    );
  });
});
