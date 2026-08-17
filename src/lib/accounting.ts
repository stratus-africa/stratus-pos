export type JournalLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string;
};

export function requireMapping(
  map: Record<string, string | undefined | null>,
  key: string,
  label: string,
): string {
  const value = map[key];
  if (!value) {
    throw new Error(`Accounting configuration incomplete: ${label} account is not configured.`);
  }
  return value;
}

export function validateJournalLines(lines: JournalLineInput[]) {
  let debits = 0;
  let credits = 0;

  for (const line of lines) {
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);

    if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
      throw new Error("Journal lines must contain finite numeric debit and credit values.");
    }
    if (debit < 0 || credit < 0) {
      throw new Error("Journal lines cannot contain negative debit or credit amounts.");
    }
    if (debit > 0 && credit > 0) {
      throw new Error("A journal line cannot contain both debit and credit.");
    }
    if (debit === 0 && credit === 0) {
      throw new Error("Journal lines must contain either a debit or a credit.");
    }

    debits += debit;
    credits += credit;
  }

  if (debits !== credits) {
    throw new Error(`Journal is not balanced: debits ${debits} and credits ${credits} differ.`);
  }

  return true;
}

export function buildPurchaseJournal({
  inventoryAccountId,
  inputVatAccountId,
  payablesAccountId,
  inventoryAmount,
  inputVatAmount,
  payableAmount,
}: {
  inventoryAccountId: string;
  inputVatAccountId: string;
  payablesAccountId: string;
  inventoryAmount: number;
  inputVatAmount: number;
  payableAmount: number;
}): JournalLineInput[] {
  const lines: JournalLineInput[] = [
    { accountId: inventoryAccountId, debit: inventoryAmount, description: "Inventory purchase" },
  ];

  if (inputVatAmount > 0) {
    lines.push({ accountId: inputVatAccountId, debit: inputVatAmount, description: "Input VAT" });
  }

  lines.push({ accountId: payablesAccountId, credit: payableAmount, description: "Accounts payable" });

  validateJournalLines(lines);
  return lines;
}

export function buildSaleJournal({
  cashAccountId,
  receivableAccountId,
  revenueAccountId,
  vatAccountId,
  cogsAccountId,
  inventoryAccountId,
  grossAmount,
  revenueNet,
  vatAmount,
  cogsAmount,
}: {
  cashAccountId: string;
  receivableAccountId: string;
  revenueAccountId: string;
  vatAccountId: string;
  cogsAccountId: string;
  inventoryAccountId: string;
  grossAmount: number;
  revenueNet: number;
  vatAmount: number;
  cogsAmount: number;
}): JournalLineInput[] {
  const paymentAccountId = grossAmount > 0 ? cashAccountId : receivableAccountId;

  const lines: JournalLineInput[] = [
    { accountId: paymentAccountId, debit: grossAmount, description: "Cash / Accounts Receivable" },
    { accountId: revenueAccountId, credit: revenueNet, description: "Sales revenue" },
  ];

  if (vatAmount > 0) {
    lines.push({ accountId: vatAccountId, credit: vatAmount, description: "Output VAT" });
  }

  if (cogsAmount > 0) {
    lines.push({ accountId: cogsAccountId, debit: cogsAmount, description: "Cost of goods sold" });
    lines.push({ accountId: inventoryAccountId, credit: cogsAmount, description: "Inventory relief" });
  }

  validateJournalLines(lines);
  return lines;
}
