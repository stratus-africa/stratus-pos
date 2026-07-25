// Shared price tag template config used by Settings editor and the Print Tags dialog.

export interface PriceTagConfig {
  layout: "30" | "24" | "12";
  showBusinessName: boolean;
  showProductName: boolean;
  showSku: boolean;
  showBarcode: boolean;
  showPrice: boolean;
  showCurrency: boolean;
  showBatch: boolean;
  fontFamily: string;
  nameFontSize: number;
  priceFontSize: number;
  priceColor: string;
  borderStyle: "dashed" | "solid" | "none";
  borderColor: string;
  backgroundColor: string;
  footerText: string;
  businessNameAlign: TextAlign;
  nameAlign: TextAlign;
  metaAlign: TextAlign;
  priceAlign: TextAlign;
  footerAlign: TextAlign;
}

export type TextAlign = "left" | "center" | "right";

export const defaultPriceTagConfig: PriceTagConfig = {
  layout: "30",
  showBusinessName: false,
  showProductName: true,
  showSku: true,
  showBarcode: true,
  showPrice: true,
  showCurrency: true,
  showBatch: true,
  fontFamily: "system-ui, -apple-system, sans-serif",
  nameFontSize: 12,
  priceFontSize: 14,
  priceColor: "#0f172a",
  borderStyle: "dashed",
  borderColor: "#cbd5e1",
  backgroundColor: "#ffffff",
  footerText: "",
  businessNameAlign: "left",
  nameAlign: "left",
  metaAlign: "left",
  priceAlign: "left",
  footerAlign: "center",
};

const key = (businessId: string) => `price_tag_config_${businessId}`;

export function loadPriceTagConfig(businessId: string | undefined): PriceTagConfig {
  if (!businessId) return defaultPriceTagConfig;
  try {
    const raw = localStorage.getItem(key(businessId));
    if (raw) return { ...defaultPriceTagConfig, ...JSON.parse(raw) };
  } catch {}
  return defaultPriceTagConfig;
}

export function savePriceTagConfig(businessId: string, cfg: PriceTagConfig) {
  localStorage.setItem(key(businessId), JSON.stringify(cfg));
}

export const PRICE_TAG_FONT_OPTIONS = [
  { label: "System Sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Inter", value: "'Inter', system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'Courier New', monospace" },
  { label: "Rounded", value: "'Nunito', system-ui, sans-serif" },
];

export const PRICE_TAG_LAYOUTS: Record<PriceTagConfig["layout"], { cols: number; rows: number; label: string }> = {
  "30": { cols: 3, rows: 10, label: "30 per page (3×10)" },
  "24": { cols: 3, rows: 8, label: "24 per page (3×8)" },
  "12": { cols: 2, rows: 6, label: "12 per page (2×6)" },
};
