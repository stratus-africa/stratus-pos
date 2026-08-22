// DigiTax queue processor. Uses the real DigiTax Kenya v2 API when provider=digitax;
// mock remains available for local/demo tenants.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Body { queue_id?: string; limit?: number }

const API_BASE = "https://api.digitax.tech/ke/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);
  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { body = {}; }

  let items: any[] = [];
  if (body.queue_id) {
    const { data } = await admin.from("digitax_invoice_queue").select("*").eq("id", body.queue_id)
      .in("status", ["pending", "retry_required"]).limit(1);
    items = data ?? [];
    if (items.length) await admin.from("digitax_invoice_queue").update({ status: "processing" }).eq("id", body.queue_id);
  } else {
    const { data } = await admin.rpc("digitax_pick_queue_batch", { _limit: body.limit ?? 25 });
    items = data ?? [];
  }

  const results: Array<{ id: string; ok: boolean; message?: string }> = [];
  for (const q of items) {
    const settingsRes = await admin.from("digitax_settings").select("*").eq("business_id", q.business_id).maybeSingle();
    const settings = settingsRes.data;
    if (!settings?.enabled) {
      await admin.from("digitax_invoice_queue").update({ status: "skipped", error_message: "DigiTax disabled" }).eq("id", q.id);
      results.push({ id: q.id, ok: false, message: "disabled" });
      continue;
    }

    const start = Date.now();
    try {
      let fiscal: any;
      if (settings.provider === "digitax") {
        const { data: apiKey, error: keyError } = await admin.rpc("digitax_get_api_key", { _business_id: q.business_id });
        if (keyError) throw new Error(`Could not read DigiTax API key: ${keyError.message}`);
        if (!apiKey) throw new Error("DigiTax API key is not configured");
        fiscal = await submitToDigiTax(q, settings, String(apiKey), url);
      } else {
        fiscal = simulateProvider(q.payload_json, settings);
      }
      const dur = Date.now() - start;

      await admin.from("digitax_logs").insert({
        business_id: q.business_id, endpoint: q.invoice_type === "credit_note" ? "credit-notes" : "sales",
        request_json: q.payload_json, response_json: fiscal.raw ?? fiscal, http_status: fiscal.ok ? 201 : 500,
        execution_time_ms: dur, sale_id: q.sale_id, queue_id: q.id,
      });

      if (fiscal.ok) {
        await admin.from("digitax_invoice_queue").update({
          status: "submitted", response_json: fiscal.raw ?? fiscal,
          submitted_at: fiscal.submitted_at ?? new Date().toISOString(), error_message: null,
        }).eq("id", q.id);
        if (q.sale_id && fiscal.callback_pending !== true) {
          await admin.from("sales").update({
            fiscal_status: "submitted", fiscal_invoice_number: fiscal.fiscal_invoice_number ?? null,
            fiscal_reference: fiscal.fiscal_reference ?? null, fiscal_qr_code: fiscal.fiscal_qr_code ?? null,
            fiscal_verification_url: fiscal.fiscal_verification_url ?? null, fiscal_signature: fiscal.fiscal_signature ?? null,
            fiscal_submitted_at: fiscal.submitted_at ?? new Date().toISOString(),
          }).eq("id", q.sale_id);
        }
        results.push({ id: q.id, ok: true });
      } else throw new Error(fiscal.error ?? "DigiTax submission failed");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = (q.retry_count ?? 0) + 1;
      const max = settings.max_retry_attempts ?? 5;
      const nextDelayMin = Math.min(60, Math.pow(2, attempts));
      const status = attempts >= max ? "failed" : "retry_required";
      await admin.from("digitax_invoice_queue").update({
        status, retry_count: attempts, next_retry_at: new Date(Date.now() + nextDelayMin * 60_000).toISOString(),
        error_message: message,
      }).eq("id", q.id);
      if (q.sale_id) await admin.from("sales").update({ fiscal_status: status === "failed" ? "failed" : "retry_required" }).eq("id", q.sale_id);
      await admin.from("digitax_logs").insert({
        business_id: q.business_id, endpoint: q.invoice_type === "credit_note" ? "credit-notes" : "sales",
        request_json: q.payload_json, response_json: { error: message }, http_status: 500,
        execution_time_ms: Date.now() - start, sale_id: q.sale_id, queue_id: q.id,
      });
      results.push({ id: q.id, ok: false, message });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function submitToDigiTax(q: any, settings: any, apiKey: string, supabaseUrl: string) {
  const p = q.payload_json ?? {};
  const callback = `${supabaseUrl}/functions/v1/digitax-webhook?queue_id=${encodeURIComponent(q.id)}`;
  const isCredit = q.invoice_type === "credit_note";
  const items = (p.items ?? []).map((it: any) => ({
    item_class_code: it.item_classification ?? it.hs_code ?? "99020000",
    item_type_code: it.item_type_code ?? "3",
    item_name: it.name ?? "Item",
    origin_nation_code: it.country_of_origin ?? it.origin_nation_code ?? "KE",
    package_unit_code: it.packaging_unit ?? it.package_unit_code ?? "NT",
    quantity_unit_code: it.quantity_unit ?? it.quantity_unit_code ?? "U",
    tax_type_code: it.tax_type_code ?? mapTaxType(it.tax_category),
    quantity: Number(it.quantity ?? 0),
    unit_price: Number(it.unit_price ?? 0),
    discount: Number(it.discount ?? 0),
    total: Number(it.total ?? 0),
    item_bar_code: it.item_bar_code ?? undefined,
  }));

  const paymentType = p.payment_type_code ?? "07";
  const body: any = {
    sale_date: String(p.issued_at ?? new Date().toISOString()).slice(0, 10),
    customer_tin: p.customer?.kra_pin ?? undefined,
    customer_name: p.customer?.name ?? undefined,
    customer_id: p.customer?.id ?? undefined,
    trader_invoice_number: p.invoice_number,
    payment_type_code: paymentType,
    invoice_status_code: "01",
    receipt_type_code: isCredit ? "R" : "S",
    original_invoice_number: isCredit ? (p.original_invoice_number ?? undefined) : undefined,
    callback_url: callback,
    invoice_details: JSON.stringify({ subtotal: p.subtotal, tax: p.tax, discount: p.discount, total: p.total }),
    is_tax_exempt: !!p.customer?.tax_exemption_number,
    items,
  };

  const res = await fetch(`${API_BASE}/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(stripUndefined(body)),
  });
  const text = await res.text();
  let raw: any = null; try { raw = text ? JSON.parse(text) : null; } catch { raw = text; }
  if (!res.ok) throw new Error(`DigiTax ${res.status}: ${typeof raw === "string" ? raw : JSON.stringify(raw)}`);

  // DigiTax normally completes asynchronously via callback_url. Preserve any
  // synchronous identifiers but keep the queue submitted until the callback
  // supplies the KRA receipt/signature.
  return {
    ok: true, status: "accepted", callback_pending: true, raw,
    fiscal_reference: raw?.data?.receipt_signature ?? raw?.receipt_signature ?? raw?.data?.id ?? raw?.id ?? null,
    submitted_at: new Date().toISOString(),
  };
}

function stripUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndefined(v)]));
  return value;
}

function mapTaxType(category?: string | null): string {
  const v = String(category ?? "").toLowerCase();
  if (v.includes("zero") || v === "z") return "A";
  if (v.includes("exempt") || v === "e") return "E";
  return "B"; // standard 16% category in common eTIMS/DigiTax mappings
}

function simulateProvider(payload: any, settings: any) {
  const rate = Number(settings.mock_failure_rate ?? 0);
  if (Math.random() < rate) return { ok: false, status: "failed", error: "Mock KRA rejection: invalid tax rate" };
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ref = `KRA-${stamp}-${Math.floor(Math.random() * 900000 + 100000)}`;
  const verify = `https://itax.kra.go.ke/verify/${ref}`;
  return { ok: true, status: "accepted", fiscal_invoice_number: `FIS-${payload.invoice_number}`, fiscal_reference: ref,
    fiscal_qr_code: `${verify}#${ref}`, fiscal_verification_url: verify, fiscal_signature: btoa(ref + ":" + Number(payload.total || 0).toFixed(2)).slice(0, 32), submitted_at: new Date().toISOString() };
}
