// Real DigitaxProvider — thin wrapper implementing TaxProvider.
// The full endpoint set (sales, credit notes, customers, items, branches, auth)
// lives in sibling files and is filled in once the KRA sandbox docs are wired.
// Until then, `provider.ts` prefers MockDigitaxProvider.

import type { TaxProvider, FiscalInvoiceInput, FiscalResponse, TestConnectionResult, SyncMasterDataResult } from "../types";
import { DigitaxClient } from "./client";
import { TaxNetworkError } from "../errors";

export interface DigitaxProviderOptions {
  baseUrl: string;
  apiKey: string;
  businessPin: string;
  branchCode?: string | null;
  deviceName?: string | null;
}

export class DigitaxProvider implements TaxProvider {
  readonly id = "digitax";
  private client: DigitaxClient;
  constructor(opts: DigitaxProviderOptions) {
    this.client = new DigitaxClient(opts);
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      await this.client.request("/health");
      return { ok: true, message: "DigiTax reachable" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async submitInvoice(_input: FiscalInvoiceInput): Promise<FiscalResponse> {
    throw new TaxNetworkError("Real DigiTax provider not yet configured — using mock provider");
  }
  async submitCreditNote(_input: FiscalInvoiceInput): Promise<FiscalResponse> {
    throw new TaxNetworkError("Real DigiTax provider not yet configured — using mock provider");
  }
  async syncMasterData(): Promise<SyncMasterDataResult> {
    return { customers: 0, items: 0 };
  }
}
