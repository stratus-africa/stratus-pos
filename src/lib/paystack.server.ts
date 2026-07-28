// Server-only helpers for Paystack server functions. Never import from client code.

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

export async function paystackFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === false) {
    throw new Error(`Paystack ${path} failed [${res.status}]: ${body?.message || JSON.stringify(body)}`);
  }
  return body as T;
}
