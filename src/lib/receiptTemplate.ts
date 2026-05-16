// Shared receipt template config used by Settings editor and printable receipts.

export interface ReceiptConfig {
  header: string;
  footer: string;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showTaxBreakdown: boolean;
  thankYouMessage: string;
  fontFamily: string;
  fontSize: number; // base font size in px
  headerFontSize: number;
  showServedBy: boolean;
  showPrintedAt: boolean;
}

export const defaultReceiptConfig: ReceiptConfig = {
  header: "",
  footer: "",
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showTaxBreakdown: true,
  thankYouMessage: "Thank you for your purchase!",
  fontFamily: "monospace",
  fontSize: 12,
  headerFontSize: 14,
  showServedBy: true,
  showPrintedAt: true,
};

const key = (businessId: string) => `receipt_config_${businessId}`;

export function loadReceiptConfig(businessId: string | undefined): ReceiptConfig {
  if (!businessId) return defaultReceiptConfig;
  try {
    const raw = localStorage.getItem(key(businessId));
    if (raw) return { ...defaultReceiptConfig, ...JSON.parse(raw) };
  } catch {}
  return defaultReceiptConfig;
}

export function saveReceiptConfig(businessId: string, cfg: ReceiptConfig) {
  localStorage.setItem(key(businessId), JSON.stringify(cfg));
}

export const FONT_OPTIONS = [
  { label: "Monospace", value: "monospace" },
  { label: "Sans Serif", value: "'Inter', system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Rounded", value: "'Nunito', system-ui, sans-serif" },
  { label: "Condensed", value: "'Arial Narrow', sans-serif" },
];
