// Tax provider contract. The Sales module imports ONLY from `@/services/tax`
// so additional providers (ETIMS, Uganda, Rwanda, ...) can be dropped in later
// without touching POS/Sales code.

export type FiscalStatus =
  | "not_applicable"
  | "pending_submission"
  | "submitted"
  | "accepted"
  | "failed"
  | "retry_required";

export interface FiscalResponse {
  ok: boolean;
  status: FiscalStatus;
  fiscal_invoice_number?: string;
  fiscal_reference?: string;
  fiscal_qr_code?: string; // data URL or plain text payload
  fiscal_verification_url?: string;
  fiscal_signature?: string;
  submitted_at?: string;
  raw?: unknown;
  error?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface SyncMasterDataResult {
  customers: number;
  items: number;
}

// Minimal shape the provider needs — deliberately decoupled from DB rows so
// the sales module can build it from whatever source (POS in-memory, queue
// row, edge function).
export interface FiscalInvoiceInput {
  business_id: string;
  sale_id: string;
  invoice_number: string;
  invoice_type: "invoice" | "credit_note" | "debit_note" | "proforma";
  original_invoice_number?: string;
  customer?: {
    name?: string | null;
    kra_pin?: string | null;
    vat_registered?: boolean | null;
    customer_type?: string | null;
    tax_exemption_number?: string | null;
  } | null;
  items: Array<{
    name: string;
    kra_item_code?: string | null;
    hs_code?: string | null;
    quantity: number;
    unit_price: number;
    discount: number;
    tax_rate?: number;
    tax_category?: string | null;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  issued_at: string;
}

export interface TaxProvider {
  readonly id: string;
  testConnection(): Promise<TestConnectionResult>;
  submitInvoice(input: FiscalInvoiceInput): Promise<FiscalResponse>;
  submitCreditNote(input: FiscalInvoiceInput): Promise<FiscalResponse>;
  syncMasterData(): Promise<SyncMasterDataResult>;
}
