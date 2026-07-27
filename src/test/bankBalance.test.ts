import { describe, it, expect } from "vitest";
import { deriveBalance, signedAmount, violatesNegativeGuard, type SignedTxn } from "@/lib/bankBalance";

/**
 * Simulates the DB behaviour: bank_transactions rows are the source of truth and the
 * account balance is always recomputed as opening_balance + sum(signed amounts).
 * Deleting a sale removes its bank transactions (ON DELETE trigger) — nothing else.
 */
class Ledger {
  opening: number;
  allowNegative: boolean;
  txns: (SignedTxn & { id: string; sale_id?: string })[] = [];

  constructor(opening = 0, allowNegative = false) {
    this.opening = opening;
    this.allowNegative = allowNegative;
  }

  get balance() {
    return deriveBalance(this.opening, this.txns);
  }

  postSale(id: string, type: SignedTxn["type"], amount: number) {
    const before = this.balance;
    this.txns.push({ id: `t-${id}`, sale_id: id, type, amount });
    this.assertGuard(before);
  }

  deleteSale(id: string) {
    const before = this.balance;
    const kept = this.txns.filter((t) => t.sale_id !== id);
    const removed = this.txns.filter((t) => t.sale_id === id);
    this.txns = kept;
    const after = this.balance;
    if (violatesNegativeGuard(before, after, this.allowNegative)) {
      // Fully revert, as the DB transaction would
      this.txns = [...kept, ...removed];
      throw new Error("negative balance guard");
    }
  }

  private assertGuard(before: number) {
    if (violatesNegativeGuard(before, this.balance, this.allowNegative)) {
      this.txns.pop();
      throw new Error("negative balance guard");
    }
  }
}

describe("signedAmount", () => {
  it("credits inflow types and debits outflow types", () => {
    expect(signedAmount("payment_received", 100)).toBe(100);
    expect(signedAmount("transfer_in", 50)).toBe(50);
    expect(signedAmount("owner_deposit", 10)).toBe(10);
    expect(signedAmount("payment_made", 100)).toBe(-100);
    expect(signedAmount("expense", 25)).toBe(-25);
  });
});

describe("sale delete / re-post keeps bank balances correct", () => {
  it.each(["cash", "mpesa", "card", "bank"])("round-trips a %s sale back to the original balance", (method) => {
    const ledger = new Ledger(1000);
    const start = ledger.balance;
    ledger.postSale(`sale-${method}`, "payment_received", 250);
    expect(ledger.balance).toBe(1250);
    ledger.deleteSale(`sale-${method}`);
    expect(ledger.balance).toBe(start);
    ledger.postSale(`sale-${method}`, "payment_received", 250);
    expect(ledger.balance).toBe(1250);
  });

  it("never double-reverses on repeated deletes", () => {
    const ledger = new Ledger(500);
    ledger.postSale("s1", "payment_received", 200);
    ledger.deleteSale("s1");
    ledger.deleteSale("s1");
    ledger.deleteSale("s1");
    expect(ledger.balance).toBe(500);
  });

  it("handles split tender (cash + mpesa) on one sale", () => {
    const ledger = new Ledger(0);
    ledger.txns.push({ id: "a", sale_id: "s2", type: "payment_received", amount: 300 });
    ledger.txns.push({ id: "b", sale_id: "s2", type: "payment_received", amount: 700 });
    expect(ledger.balance).toBe(1000);
    ledger.deleteSale("s2");
    expect(ledger.balance).toBe(0);
  });

  it("derived balance always equals opening + transaction sum", () => {
    const ledger = new Ledger(120);
    ledger.postSale("s3", "payment_received", 80);
    ledger.txns.push({ id: "e1", type: "expense", amount: 50 });
    const derived = deriveBalance(ledger.opening, ledger.txns);
    expect(ledger.balance).toBe(derived);
    expect(derived).toBe(150);
  });
});

describe("negative balance guard", () => {
  it("blocks and fully reverts a delete that would go negative", () => {
    const ledger = new Ledger(0);
    ledger.txns.push({ id: "in", sale_id: "s4", type: "payment_received", amount: 100 });
    ledger.txns.push({ id: "out", type: "expense", amount: 90 });
    expect(ledger.balance).toBe(10);

    expect(() => ledger.deleteSale("s4")).toThrow(/negative/);
    // fully reverted — balance and rows unchanged
    expect(ledger.balance).toBe(10);
    expect(ledger.txns).toHaveLength(2);
  });

  it("allows going negative when the account permits it", () => {
    const ledger = new Ledger(0, true);
    ledger.txns.push({ id: "in", sale_id: "s5", type: "payment_received", amount: 100 });
    ledger.txns.push({ id: "out", type: "expense", amount: 90 });
    ledger.deleteSale("s5");
    expect(ledger.balance).toBe(-90);
  });

  it("does not block operations that improve an already negative balance", () => {
    expect(violatesNegativeGuard(-100, -40, false)).toBe(false);
    expect(violatesNegativeGuard(-40, -100, false)).toBe(true);
    expect(violatesNegativeGuard(50, 10, false)).toBe(false);
  });
});
