/**
 * POS split-divider width preference.
 *
 * Two layers:
 *  - Tenant default (`businesses.pos_split_pct`) — what every till starts from.
 *  - Local override — stored per user AND per device (browser), so two cashiers
 *    sharing one till each keep their own width, and the same user on another
 *    device starts from the tenant default until they drag it.
 */

export const SPLIT_MIN = 30;
export const SPLIT_MAX = 80;
export const SPLIT_FALLBACK = 60;

const DEVICE_KEY = "pos_device_id";

/** Stable, random per-browser id (not a fingerprint). */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? String(Math.random()).slice(2));
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function key(businessId?: string | null, userId?: string | null) {
  return `pos_split_pct:${businessId ?? "nb"}:${userId ?? "nu"}:${getDeviceId()}`;
}

export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return SPLIT_FALLBACK;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(value)));
}

/** Local override for this user + device, or null when they haven't set one. */
export function loadLocalSplit(businessId?: string | null, userId?: string | null): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key(businessId, userId));
  if (!raw) return null;
  const n = Number(raw);
  return n >= SPLIT_MIN && n <= SPLIT_MAX ? n : null;
}

export function saveLocalSplit(pct: number, businessId?: string | null, userId?: string | null) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(businessId, userId), String(clampSplit(pct)));
}

export function clearLocalSplit(businessId?: string | null, userId?: string | null) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key(businessId, userId));
}
