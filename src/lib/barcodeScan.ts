/**
 * Configurable barcode scanner timing rules + retail barcode parsing (GS1/GTIN).
 *
 * Settings are cached per-browser and persisted per tenant in `business_settings`
 * so every till/device in the business shares the same rules.
 */

import { supabase } from "@/integrations/supabase/client";

export interface BarcodeScanSettings {
  /** Minimum number of characters before a burst is treated as a barcode. */
  minLength: number;
  /** Maximum milliseconds allowed between two keystrokes of the same scan. */
  maxInterval: number;
  /** How the end of a scan is detected. */
  enterHandling: "required" | "optional" | "ignore";
  /** When enterHandling !== "required", flush the buffer after this idle time (ms). */
  idleFlush: number;
  /**
   * Identical barcodes scanned again within this window (ms) are ignored, so a
   * scanner burst / double trigger cannot double-add the same item.
   */
  scanCooldown: number;
  /** On no match, put the code in the product search box and focus it. */
  openSearchOnMiss: boolean;
  /** Scanned matches are added to the cart automatically (no click required). */
  autoAddToCart: boolean;
  /** Parse GS1/GTIN application identifiers and normalise EAN/UPC variants. */
  parseGs1: boolean;
}

export const DEFAULT_SCAN_SETTINGS: BarcodeScanSettings = {
  minLength: 4,
  maxInterval: 80,
  enterHandling: "optional",
  idleFlush: 220,
  scanCooldown: 250,
  openSearchOnMiss: true,
  autoAddToCart: true,
  parseGs1: true,
};


const SETTING_KEY = "barcode_scan_settings";
const LEGACY_KEY = "pos.barcodeScanSettings";
const cacheKey = (businessId?: string | null) =>
  businessId ? `pos.barcodeScanSettings.${businessId}` : LEGACY_KEY;

function normalize(raw: unknown): BarcodeScanSettings {
  const parsed = (raw || {}) as Partial<BarcodeScanSettings>;
  return { ...DEFAULT_SCAN_SETTINGS, ...parsed };
}

/** Synchronous read from the local cache (used for instant first paint). */
export function loadScanSettings(businessId?: string | null): BarcodeScanSettings {
  try {
    const raw =
      localStorage.getItem(cacheKey(businessId)) ??
      localStorage.getItem(LEGACY_KEY);
    if (!raw) return DEFAULT_SCAN_SETTINGS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_SCAN_SETTINGS;
  }
}

/** Tenant-wide settings from the backend, falling back to the local cache. */
export async function fetchScanSettings(businessId: string): Promise<BarcodeScanSettings> {
  const { data } = await supabase
    .from("business_settings" as any)
    .select("value")
    .eq("business_id", businessId)
    .eq("key", SETTING_KEY)
    .maybeSingle();
  const value = (data as any)?.value;
  const merged = value ? normalize(value) : loadScanSettings(businessId);
  try {
    localStorage.setItem(cacheKey(businessId), JSON.stringify(merged));
  } catch { /* ignore */ }
  return merged;
}

export async function saveScanSettings(s: BarcodeScanSettings, businessId?: string | null) {
  const clean = normalize(s);
  try {
    localStorage.setItem(cacheKey(businessId), JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent("barcode-scan-settings-changed"));
  } catch { /* ignore */ }
  if (!businessId) return;
  const { error } = await supabase
    .from("business_settings" as any)
    .upsert(
      {
        business_id: businessId,
        key: SETTING_KEY,
        value: clean as any,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "business_id,key" } as any,
    );
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* GS1 / GTIN parsing                                                  */
/* ------------------------------------------------------------------ */

export interface ParsedBarcode {
  /** The original, untruncated scan. */
  raw: string;
  /** GTIN as encoded (may be 14 digits from AI 01). */
  gtin?: string;
  /** Batch/lot number (AI 10). */
  lot?: string;
  /** Serial number (AI 21). */
  serial?: string;
  /** Expiry date YYMMDD (AI 17). */
  expiry?: string;
  /** Weight/price embedded value from AI 310n/392n, if present. */
  quantity?: number;
  price?: number;
  /**
   * Codes to try against product.barcode / product.sku, most specific first.
   */
  candidates: string[];
}

const GS = "\u001d"; // FNC1 group separator
/** AIs with a fixed total length (including the AI itself). */
const FIXED_AI: Record<string, number> = {
  "00": 20, "01": 16, "02": 16, "03": 16, "04": 18,
  "11": 8, "12": 8, "13": 8, "15": 8, "16": 8, "17": 8,
  "20": 4, "31": 10, "32": 10, "33": 10, "34": 10, "35": 10, "36": 10,
  "41": 16,
};

function digitsOnly(s: string) {
  return /^\d+$/.test(s);
}

/** GTIN variants: pad/strip leading zeros so 8/12/13/14-digit forms all match. */
function gtinVariants(code: string): string[] {
  if (!digitsOnly(code)) return [];
  const stripped = code.replace(/^0+/, "") || "0";
  const out = new Set<string>([code]);
  for (const len of [8, 12, 13, 14]) {
    if (stripped.length <= len) out.add(stripped.padStart(len, "0"));
  }
  out.add(stripped);
  return Array.from(out);
}

function parseGs1Elements(input: string): Partial<ParsedBarcode> | null {
  let s = input.startsWith("]") ? input.slice(3) : input; // strip AIM symbology id
  s = s.replace(/^\u001d/, "");
  if (s.length < 4 || !/^(01|02|00|21|10|17|8)/.test(s)) return null;

  const out: Partial<ParsedBarcode> = {};
  let i = 0;
  let matched = 0;
  while (i < s.length) {
    const ai2 = s.slice(i, i + 2);
    if (!/^\d{2}$/.test(ai2)) break;
    const fixedLen = FIXED_AI[ai2];
    if (fixedLen) {
      // 31x-36x carry a decimal-point digit after the 3rd AI char.
      const isMeasure = /^3[1-6]$/.test(ai2);
      const aiLen = isMeasure ? 4 : 2;
      const total = fixedLen;
      const value = s.slice(i + aiLen, i + total);
      if (value.length < total - aiLen) break;
      if (ai2 === "01" || ai2 === "02") out.gtin = value;
      if (ai2 === "17") out.expiry = value;
      if (isMeasure) {
        const dp = Number(s[i + 3]);
        const num = Number(value) / Math.pow(10, isNaN(dp) ? 0 : dp);
        if (ai2 === "31" || ai2 === "32") out.quantity = num;
      }
      i += total;
      matched++;
      continue;
    }
    // Variable-length AI: terminated by GS or end of string.
    const varAis = ["10", "21", "22", "30", "37", "90", "91", "92", "93", "94", "95"];
    if (varAis.includes(ai2)) {
      const rest = s.slice(i + 2);
      const end = rest.indexOf(GS);
      const value = end === -1 ? rest : rest.slice(0, end);
      if (ai2 === "10") out.lot = value;
      if (ai2 === "21") out.serial = value;
      if (ai2 === "30") out.quantity = Number(value) || undefined;
      i += 2 + value.length + (end === -1 ? 0 : 1);
      matched++;
      continue;
    }
    break;
  }
  return matched > 0 ? out : null;
}

/**
 * Parse a scanned code into candidate product lookup keys.
 * Handles plain codes, GS1 element strings, EAN/UPC padding variants and
 * weight/price-embedded (GS1 prefix 2x) retail labels.
 */
export function parseBarcode(raw: string, enabled = true): ParsedBarcode {
  const code = raw.trim();
  const result: ParsedBarcode = { raw: code, candidates: [code] };
  if (!enabled || !code) return result;

  const gs1 = parseGs1Elements(code);
  if (gs1) {
    Object.assign(result, gs1);
    if (gs1.gtin) result.candidates.unshift(...gtinVariants(gs1.gtin));
    if (gs1.serial) result.candidates.push(gs1.serial);
  } else if (digitsOnly(code)) {
    result.candidates.push(...gtinVariants(code));

    // Weight/price embedded EAN-13 (prefix 02x / 2x): item code + embedded value.
    if (code.length === 13 && code.startsWith("2")) {
      const itemRef = code.slice(0, 7);      // prefix + item number
      const embedded = code.slice(7, 12);    // weight or price, 2 decimals
      result.candidates.push(itemRef, code.slice(1, 7));
      const val = Number(embedded) / 100;
      if (!isNaN(val) && val > 0) result.price = val;
    }
  }

  // De-duplicate while preserving priority order.
  result.candidates = Array.from(new Set(result.candidates.filter(Boolean)));
  return result;
}
