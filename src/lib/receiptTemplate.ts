// Shared receipt template config used by Settings editor and printable receipts.

export type QRCodeType = "invoice_url" | "fiscal_url" | "custom";
export type QRCodePosition = "header" | "middle" | "footer";
/** Physical paper the receipt printer is loaded with. */
export type ReceiptPaper = "80mm" | "58mm" | "a4";

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
  showQRCode: boolean;
  qrCodeType: QRCodeType;
  qrCodeCustomValue: string;
  qrCodeSize: number;
  qrCodeLabel: string;
  qrCodePosition: QRCodePosition;
  /** Persisted per business — remembered for every future receipt print. */
  paper: ReceiptPaper;
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
  showQRCode: false,
  qrCodeType: "invoice_url",
  qrCodeCustomValue: "",
  qrCodeSize: 96,
  qrCodeLabel: "Scan to view",
  qrCodePosition: "footer",
  paper: "80mm",
};

export const PAPER_OPTIONS: { label: string; value: ReceiptPaper; width: string }[] = [
  { label: "80mm Thermal", value: "80mm", width: "80mm" },
  { label: "58mm Thermal", value: "58mm", width: "58mm" },
  { label: "A4 / Letter", value: "a4", width: "190mm" },
];

export function paperWidth(paper: ReceiptPaper | undefined): string {
  return PAPER_OPTIONS.find((p) => p.value === paper)?.width ?? "80mm";
}


import { supabase } from "@/integrations/supabase/client";

const SETTING_KEY = "receipt_template";
const key = (businessId: string) => `receipt_config_${businessId}`;

export function loadReceiptConfig(businessId: string | undefined): ReceiptConfig {
  if (!businessId) return defaultReceiptConfig;
  try {
    const raw = localStorage.getItem(key(businessId));
    if (raw) return { ...defaultReceiptConfig, ...JSON.parse(raw) };
  } catch {}
  return defaultReceiptConfig;
}

export async function fetchReceiptConfig(businessId: string): Promise<ReceiptConfig> {
  const { data } = await supabase
    .from("business_settings" as any)
    .select("value")
    .eq("business_id", businessId)
    .eq("key", SETTING_KEY)
    .maybeSingle();
  const value = (data as any)?.value;
  const merged: ReceiptConfig = value
    ? { ...defaultReceiptConfig, ...(value as ReceiptConfig) }
    : loadReceiptConfig(businessId);
  try { localStorage.setItem(key(businessId), JSON.stringify(merged)); } catch {}
  return merged;
}

export async function saveReceiptConfig(businessId: string, cfg: ReceiptConfig) {
  localStorage.setItem(key(businessId), JSON.stringify(cfg));
  const { error } = await supabase
    .from("business_settings" as any)
    .upsert(
      { business_id: businessId, key: SETTING_KEY, value: cfg as any, updated_at: new Date().toISOString() } as any,
      { onConflict: "business_id,key" } as any,
    );
  if (error) throw error;
}

export const FONT_OPTIONS = [
  { label: "Monospace", value: "monospace" },
  { label: "Sans Serif", value: "'Inter', system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Rounded", value: "'Nunito', system-ui, sans-serif" },
  { label: "Condensed", value: "'Arial Narrow', sans-serif" },
];
