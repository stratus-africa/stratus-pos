// DigiTax Kenya API v2 client.
// Authentication uses X-API-Key as documented by DigiTax.
export interface DigitaxClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class DigitaxClient {
  constructor(private opts: DigitaxClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = this.opts.baseUrl.replace(/\/$/, "") + path;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.opts.apiKey,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const err = new Error(`DigiTax ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
      (err as { status?: number }).status = res.status;
      throw err;
    }
    return body as T;
  }
}
