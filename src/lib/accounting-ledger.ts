export type LedgerLine = {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string | null;
};

export type LedgerValidationResult = {
  valid: boolean;
  totalDebit: number;
  totalCredit: number;
  error?: string;
};

const roundMoney = (value: number) => Number(value.toFixed(2));

export function isBalancedJournal(lines: Array<Pick<LedgerLine, "debit" | "credit">>): boolean {
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
  return Math.abs(roundMoney(totalDebit) - roundMoney(totalCredit)) < 0.01;
}

export function validateJournalLines(lines: LedgerLine[]): LedgerValidationResult {
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      valid: false,
      totalDebit: 0,
      totalCredit: 0,
      error: "Journal must contain at least one line.",
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);

    if (!line.accountId || !String(line.accountId).trim()) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        error: "Each journal line requires an account id.",
      };
    }

    if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        error: "Journal amounts must be finite numeric values.",
      };
    }

    if (debit < 0 || credit < 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        error: "Debit and credit amounts must be zero or greater.",
      };
    }

    if (debit > 0 && credit > 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        error: "A journal line cannot have both debit and credit populated.",
      };
    }

    if (debit === 0 && credit === 0) {
      return {
        valid: false,
        totalDebit,
        totalCredit,
        error: "Each journal line must have exactly one side greater than zero.",
      };
    }

    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = roundMoney(totalDebit);
  totalCredit = roundMoney(totalCredit);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      error: `Journal is not balanced: debits ${totalDebit.toFixed(2)} do not equal credits ${totalCredit.toFixed(2)}.`,
    };
  }

  return {
    valid: true,
    totalDebit,
    totalCredit,
  };
}

export function assertAccountingConfig(
  mappings: Record<string, string | null | undefined>,
  requiredKeys: string[],
  label: string = "Accounting configuration incomplete",
): void {
  const missing = requiredKeys.filter((key) => !mappings[key] || !String(mappings[key]).trim());

  if (missing.length > 0) {
    throw new Error(`${label}: ${missing.join(", ")} is not configured.`);
  }
}

export const REQUIRED_ACCOUNTING_KEYS = [
  "sales_revenue",
  "sales_discounts",
  "sales_returns",
  "cogs",
  "inventory",
  "inventory_adjustments",
  "inventory_write_offs",
  "accounts_receivable",
  "accounts_payable",
  "cash",
  "bank",
  "mpesa",
  "vat_payable",
  "input_vat",
  "owner_capital",
  "owner_drawings",
  "retained_earnings",
  "other_income",
  "operating_expenses",
] as const;
