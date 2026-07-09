import type { TaxProvider, FiscalInvoiceInput, FiscalResponse, TestConnectionResult, SyncMasterDataResult } from "../types";

interface MockCfg {
  failureRate?: number; // 0..1
  latencyMs?: number;
  business_id: string;
}

function kraNumber(prefix: string) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const seq = Math.floor(Math.random() * 900000 + 100000);
  return `${prefix}-${stamp}-${seq}`;
}

// Simple QR payload the receipt can render as text or use to build a QR image.
function qrPayload(fiscalRef: string, verifyUrl: string) {
  return `${verifyUrl}#${fiscalRef}`;
}

export class MockDigitaxProvider implements TaxProvider {
  readonly id = "mock-digitax";
  constructor(private cfg: MockCfg) {}

  private async delay() {
    const ms = this.cfg.latencyMs ?? 400;
    await new Promise((r) => setTimeout(r, ms));
  }
  private shouldFail() {
    const rate = Math.max(0, Math.min(1, this.cfg.failureRate ?? 0));
    return Math.random() < rate;
  }

  async testConnection(): Promise<TestConnectionResult> {
    await this.delay();
    if (this.shouldFail()) return { ok: false, message: "Mock DigiTax sandbox unreachable" };
    return { ok: true, message: "Mock DigiTax sandbox reachable" };
  }

  async submitInvoice(input: FiscalInvoiceInput): Promise<FiscalResponse> {
    await this.delay();
    if (this.shouldFail()) {
      return { ok: false, status: "failed", error: "Simulated KRA validation error: invalid tax rate" };
    }
    const ref = kraNumber("KRA");
    const verify = `https://itax.kra.go.ke/verify/${ref}`;
    return {
      ok: true,
      status: "accepted",
      fiscal_invoice_number: `FIS-${input.invoice_number}`,
      fiscal_reference: ref,
      fiscal_qr_code: qrPayload(ref, verify),
      fiscal_verification_url: verify,
      fiscal_signature: btoa(ref + ":" + input.total.toFixed(2)).slice(0, 32),
      submitted_at: new Date().toISOString(),
      raw: { provider: "mock-digitax", environment: "sandbox" },
    };
  }

  async submitCreditNote(input: FiscalInvoiceInput): Promise<FiscalResponse> {
    const res = await this.submitInvoice({ ...input, invoice_type: "credit_note" });
    if (!res.ok) return res;
    return { ...res, fiscal_invoice_number: `CN-${input.invoice_number}` };
  }

  async syncMasterData(): Promise<SyncMasterDataResult> {
    await this.delay();
    return { customers: 0, items: 0 };
  }
}
