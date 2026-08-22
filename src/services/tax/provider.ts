import type { TaxProvider } from "./types";
import { MockDigitaxProvider } from "./digitax/mock";
import { DigitaxProvider } from "./digitax";

export interface TaxProviderConfig {
  business_id: string;
  provider: "mock" | "digitax";
  environment: "sandbox" | "production";
  api_key?: string;
  business_pin?: string | null;
  branch_code?: string | null;
  device_name?: string | null;
  mock_failure_rate?: number;
}

export function getTaxProvider(cfg: TaxProviderConfig): TaxProvider {
  if (cfg.provider === "digitax" && cfg.api_key && cfg.business_pin) {
    return new DigitaxProvider({
      baseUrl: "https://api.digitax.tech/ke/v2",
      apiKey: cfg.api_key,
    });
  }
  return new MockDigitaxProvider({
    business_id: cfg.business_id,
    failureRate: cfg.mock_failure_rate ?? 0,
  });
}
