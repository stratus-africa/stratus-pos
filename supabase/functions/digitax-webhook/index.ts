import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const queueId = new URL(req.url).searchParams.get("queue_id");
    if (!queueId) return json({ error: "queue_id is required" }, 400);
    const payload = await req.json();
    const data = payload?.data ?? payload;

    const { data: queue } = await admin.from("digitax_invoice_queue").select("id,business_id,sale_id").eq("id", queueId).maybeSingle();
    if (!queue) return json({ error: "Queue item not found" }, 404);

    const fiscalStatus = String(data?.queue_status ?? "completed").toLowerCase();
    const accepted = !["failed", "rejected", "error"].includes(fiscalStatus);
    const verificationUrl = data?.etims_url ?? data?.fiscal_verification_url ?? null;
    const signature = data?.receipt_signature ?? data?.fiscal_signature ?? null;
    const receiptNumber = data?.invoice_number ?? data?.receipt_number ?? null;
    const traderInvoice = data?.trader_invoice_number ?? null;

    await admin.from("digitax_invoice_queue").update({
      status: accepted ? "submitted" : "failed",
      response_json: payload,
      submitted_at: accepted ? new Date().toISOString() : null,
      error_message: accepted ? null : JSON.stringify(data),
    }).eq("id", queueId);

    if (queue.sale_id) {
      await admin.from("sales").update({
        fiscal_status: accepted ? "accepted" : "failed",
        fiscal_invoice_number: receiptNumber,
        fiscal_reference: traderInvoice ?? signature,
        fiscal_qr_code: verificationUrl,
        fiscal_verification_url: verificationUrl,
        fiscal_signature: signature,
        fiscal_submitted_at: accepted ? new Date().toISOString() : null,
      }).eq("id", queue.sale_id);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
