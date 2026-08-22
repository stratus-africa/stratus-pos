import type { TaxProvider, FiscalInvoiceInput, FiscalResponse, TestConnectionResult, SyncMasterDataResult } from "../types";
import { DigitaxClient } from "./client";

export interface DigitaxProviderOptions {
  baseUrl: string;
  apiKey: string;
}

export class DigitaxProvider implements TaxProvider {
  readonly id = "digitax";
  private client: DigitaxClient;
  constructor(opts: DigitaxProviderOptions) { this.client = new DigitaxClient(opts); }

  async testConnection(): Promise<TestConnectionResult> {
    try { await this.client.request("/etims-info"); return { ok: true, message: "DigiTax eTIMS connection verified" }; }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
  }

  async submitInvoice(input: FiscalInvoiceInput): Promise<FiscalResponse> {
    return this.submit(input, "S");
  }

  async submitCreditNote(input: FiscalInvoiceInput): Promise<FiscalResponse> {
    return this.submit(input, "R");
  }

  private async submit(input: FiscalInvoiceInput, receiptTypeCode: "S" | "R"): Promise<FiscalResponse> {
    try {
      const response: any = await this.client.request("/sales", {
        method: "POST",
        body: JSON.stringify({
          sale_date: input.issued_at.slice(0, 10),
          customer_tin: input.customer?.kra_pin ?? undefined,
          customer_name: input.customer?.name ?? undefined,
          trader_invoice_number: input.invoice_number,
          payment_type_code: "07",
          invoice_status_code: "01",
          receipt_type_code: receiptTypeCode,
          original_invoice_number: input.original_invoice_number,
          is_tax_exempt: !!input.customer?.tax_exemption_number,
          items: input.items.map((item) => ({
            item_class_code: item.item_classification ?? item.hs_code ?? "99020000",
            item_type_code: "3",
            item_name: item.name,
            origin_nation_code: item.country_of_origin ?? "KE",
            package_unit_code: item.packaging_unit ?? "NT",
            quantity_unit_code: item.quantity_unit ?? "U",
            tax_type_code: mapTaxType(item.tax_category),
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount,
            total: item.quantity * item.unit_price - item.discount,
          })),
        }),
      });
      const data = response?.data ?? response;
      return {
        ok: true,
        status: "accepted",
        fiscal_invoice_number: data?.invoice_number ? String(data.invoice_number) : undefined,
        fiscal_reference: data?.receipt_signature ?? data?.id,
        fiscal_qr_code: data?.etims_url,
        fiscal_verification_url: data?.etims_url,
        fiscal_signature: data?.receipt_signature,
        submitted_at: new Date().toISOString(),
        raw: response,
      };
    } catch (e) {
      return { ok: false, status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }

  async syncMasterData(): Promise<SyncMasterDataResult> { return { customers: 0, items: 0 }; }
}

function mapTaxType(category?: string | null): string {
  const value = String(category ?? "").toLowerCase();
  if (value.includes("zero") || value === "z") return "A";
  if (value.includes("exempt") || value === "e") return "E";
  return "B";
}
