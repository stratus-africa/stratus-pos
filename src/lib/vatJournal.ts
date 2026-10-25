export function buildInvoiceVatLines(vatAmount: number, payableAccountId: string, vatPayableAccountId: string) {
  if (!Number.isFinite(vatAmount) || vatAmount <= 0) throw new Error("The invoice has no VAT to post.");
  if (!payableAccountId || !vatPayableAccountId) throw new Error("Select both payable accounts.");
  if (payableAccountId === vatPayableAccountId) throw new Error("Choose two different payable accounts.");
  const amount = Math.round(vatAmount * 100) / 100;
  if (amount <= 0) throw new Error("The invoice has no VAT to post.");
  return [
    { account_id: payableAccountId, debit: amount, credit: 0, description: "Invoice VAT transfer" },
    { account_id: vatPayableAccountId, debit: 0, credit: amount, description: "VAT Payable" },
  ];
}