// Lightweight client-side draft persistence for stock adjustments.
// Stored in localStorage per business.

export interface StockAdjustmentDraft {
  lines: { product_id: string; product_name: string; sku: string | null; quantity_change: number }[];
  location_id: string;
  reason: string;
  notes: string;
  saved_at: string; // ISO timestamp
}

const key = (businessId: string) => `stock_adjustment_draft_${businessId}`;

export function loadDraft(businessId: string | undefined): StockAdjustmentDraft | null {
  if (!businessId) return null;
  try {
    const raw = localStorage.getItem(key(businessId));
    return raw ? (JSON.parse(raw) as StockAdjustmentDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(businessId: string, draft: Omit<StockAdjustmentDraft, "saved_at">) {
  localStorage.setItem(key(businessId), JSON.stringify({ ...draft, saved_at: new Date().toISOString() }));
}

export function clearDraft(businessId: string | undefined) {
  if (!businessId) return;
  localStorage.removeItem(key(businessId));
}
