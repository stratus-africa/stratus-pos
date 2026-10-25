import { describe, expect, it } from "vitest";
import { buildInvoiceVatLines } from "./vatJournal";

describe("invoice VAT journal", () => {
  it("debits the payable account and credits VAT Payable with the invoice VAT only", () => {
    expect(buildInvoiceVatLines(160, "accounts-payable", "vat-payable")).toEqual([
      { account_id: "accounts-payable", debit: 160, credit: 0, description: "Invoice VAT transfer" },
      { account_id: "vat-payable", debit: 0, credit: 160, description: "VAT Payable" },
    ]);
  });
  it("does not generate a zero VAT journal", () => {
    expect(() => buildInvoiceVatLines(0, "ap", "vat")).toThrow();
  });
  it("does not debit and credit the same account", () => {
    expect(() => buildInvoiceVatLines(160, "vat", "vat")).toThrow();
  });
});