// Real DigiTax REST client shell. Not wired in until you provide sandbox docs.
// Kept intentionally small so swap-in is a one-file change.

export interface DigitaxClientOptions {
  baseUrl: string;
  apiKey: string;
  businessPin: string;
  branchCode?: string | null;
  deviceName?: string | null;
}

export class DigitaxClient {
  constructor(private opts: DigitaxClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = this.opts.baseUrl.replace(/\/$/, "") + path;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.opts.apiKey}`,
        "X-Business-PIN": this.opts.businessPin,
        ...(this.opts.branchCode ? { "X-Branch": this.opts.branchCode } : {}),
        ...(this.opts.deviceName ? { "X-Device": this.opts.deviceName } : {}),
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
