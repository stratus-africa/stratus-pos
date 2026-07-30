/**
 * In-progress cart persistence.
 *
 * Keeps the working cart on the device (per business + location + user) so a
 * refresh, crash or app reopen doesn't lose a half-rung sale. Cleared as soon
 * as the sale is completed, suspended or explicitly cleared.
 */
import type { CartItem } from "@/hooks/usePOS";

export interface CartDraft {
  cart: CartItem[];
  customerId: string | null;
  customerName: string | null;
  savedAt: string;
}

const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

function key(businessId?: string | null, locationId?: string | null, userId?: string | null) {
  return `pos_cart_draft:${businessId ?? "nb"}:${locationId ?? "nl"}:${userId ?? "nu"}`;
}

export function saveCartDraft(
  draft: Omit<CartDraft, "savedAt">,
  ids: { businessId?: string | null; locationId?: string | null; userId?: string | null },
) {
  if (typeof window === "undefined") return;
  const k = key(ids.businessId, ids.locationId, ids.userId);
  if (!draft.cart.length) {
    localStorage.removeItem(k);
    return;
  }
  try {
    localStorage.setItem(k, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    /* quota — persistence is best-effort */
  }
}

export function loadCartDraft(ids: {
  businessId?: string | null;
  locationId?: string | null;
  userId?: string | null;
}): CartDraft | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key(ids.businessId, ids.locationId, ids.userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CartDraft;
    if (!Array.isArray(parsed.cart) || parsed.cart.length === 0) return null;
    if (Date.now() - new Date(parsed.savedAt).getTime() > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCartDraft(ids: {
  businessId?: string | null;
  locationId?: string | null;
  userId?: string | null;
}) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key(ids.businessId, ids.locationId, ids.userId));
}
