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
      baseUrl: cfg.environment === "production"
        ? "https://etims.kra.go.ke/api"
        : "https://etims-sandbox.kra.go.ke/api",
      apiKey: cfg.api_key,
      businessPin: cfg.business_pin,
      branchCode: cfg.branch_code,
      deviceName: cfg.device_name,
    });
  }
  return new MockDigitaxProvider({
    business_id: cfg.business_id,
    failureRate: cfg.mock_failure_rate ?? 0,
  });
}
