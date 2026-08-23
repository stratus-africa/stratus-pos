export const REPORT_TAB_KEYS = [
  "sales",
  "sales_by_product",
  "sales_by_customer",
  "sales_by_cashier",
  "sales_by_location",
  "sales_by_payment",
  "stock",
  "stock_movement",
  "stock_valuation",
  "stock_adjustments",
  "stock_transfers",
  "low_stock",
  "expiry",
  "audit",
  "purchases",
  "purchases_by_supplier",
  "purchase_returns",
  "expenses",
  "tax",
  "schedule",
  "general_ledger",
  "trial_balance",
  "financial_pnl",
  "balance_sheet",
  "cash_flow",
] as const;
export type ReportTabKey = (typeof REPORT_TAB_KEYS)[number];
export function isReportTabKey(value: string): value is ReportTabKey {
  return (REPORT_TAB_KEYS as readonly string[]).includes(value);
}
