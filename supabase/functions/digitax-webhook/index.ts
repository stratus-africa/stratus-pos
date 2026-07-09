// deno-lint-ignore-file
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Public callback endpoint for DigiTax provider updates.
// Authenticated via HMAC-SHA256 of the raw body using DIGITAX_WEBHOOK_SECRET.

async function verify(sig: string | null, secret: string, raw: string) {
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (hex.length !== sig.length) return false;
  let ok = 0;
  for (let i = 0; i < hex.length; i++) ok |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return ok === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const raw = await req.text();
  const secret = Deno.env.get("DIGITAX_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook not configured" }, 500);

  const sig = req.headers.get("x-digitax-signature");
  if (!(await verify(sig, secret, raw))) return json({ error: "Invalid signature" }, 401);

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { queue_id, sale_id, status, kra_receipt_no, qr_url, verification_url, signed_at, error } = body ?? {};
  if (!queue_id && !sale_id) return json({ error: "queue_id or sale_id required" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Update queue row
  if (queue_id) {
    await admin
      .from("digitax_invoice_queue")
      .update({
        status: status ?? "submitted",
        error_message: error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queue_id);
  }

  // Mirror to sales
  if (sale_id) {
    const patch: Record<string, unknown> = {
      fiscal_status: status ?? "submitted",
    };
    if (kra_receipt_no) patch.fiscal_reference = kra_receipt_no;
    if (qr_url) patch.fiscal_qr_code = qr_url;
    if (verification_url) patch.fiscal_verification_url = verification_url;
    if (signed_at) patch.fiscal_submitted_at = signed_at;
    await admin.from("sales").update(patch).eq("id", sale_id);
  }

  await admin.from("digitax_logs").insert({
    business_id: body.business_id ?? null,
    queue_id: queue_id ?? null,
    sale_id: sale_id ?? null,
    direction: "inbound",
    endpoint: "webhook",
    status_code: 200,
    request_body: body,
  });

  return json({ ok: true });

  function json(b: unknown, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
