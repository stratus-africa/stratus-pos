// Persists the most recently printed receipt payload per business so it can be
// reprinted later using the exact same customization layout.

const key = (businessId: string) => `last_receipt_${businessId}`;

export function saveLastReceipt(businessId: string | undefined, data: unknown) {
  if (!businessId || !data) return;
  try {
    localStorage.setItem(key(businessId), JSON.stringify(data));
  } catch {
    /* storage full / unavailable — reprint simply won't be offered */
  }
}

export function loadLastReceipt<T = any>(businessId: string | undefined): T | null {
  if (!businessId) return null;
  try {
    const raw = localStorage.getItem(key(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // `date` is serialised to an ISO string — revive it.
    if (parsed?.date) parsed.date = new Date(parsed.date);
    return parsed as T;
  } catch {
    return null;
  }
}

export function clearLastReceipt(businessId: string | undefined) {
  if (!businessId) return;
  try {
    localStorage.removeItem(key(businessId));
  } catch { /* noop */ }
}
