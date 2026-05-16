// Lightweight client-side number series for documents (receipts, expenses, etc.)
// Stored in localStorage per business + type.

export type SeriesKey = "receipts" | "expenses";

export interface NumberSeriesConfig {
  prefix: string;
  padding: number; // total digits, e.g. 5 => 00001
  next: number;   // next number to assign
}

const defaults: Record<SeriesKey, NumberSeriesConfig> = {
  receipts: { prefix: "INV-", padding: 5, next: 1 },
  expenses: { prefix: "EXP-", padding: 5, next: 1 },
};

const storageKey = (businessId: string, key: SeriesKey) =>
  `number_series_${businessId}_${key}`;

export function getSeries(businessId: string | undefined, key: SeriesKey): NumberSeriesConfig {
  if (!businessId) return defaults[key];
  try {
    const raw = localStorage.getItem(storageKey(businessId, key));
    if (raw) return { ...defaults[key], ...JSON.parse(raw) };
  } catch {}
  return defaults[key];
}

export function setSeries(businessId: string, key: SeriesKey, cfg: NumberSeriesConfig) {
  localStorage.setItem(storageKey(businessId, key), JSON.stringify(cfg));
}

export function formatNumber(cfg: NumberSeriesConfig, n?: number) {
  const value = n ?? cfg.next;
  return `${cfg.prefix}${String(value).padStart(Math.max(1, cfg.padding), "0")}`;
}

export function previewNext(businessId: string | undefined, key: SeriesKey): string {
  return formatNumber(getSeries(businessId, key));
}

// Consume the next number, increment, persist.
export function consumeNext(businessId: string | undefined, key: SeriesKey): string {
  const cfg = getSeries(businessId, key);
  const out = formatNumber(cfg);
  if (businessId) setSeries(businessId, key, { ...cfg, next: cfg.next + 1 });
  return out;
}
