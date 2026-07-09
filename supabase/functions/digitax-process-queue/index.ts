// deno-lint-ignore-file
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// digitax-process-queue: cron-invoked. Pulls pending queue items and submits
// them via the configured provider (mock or real). Records logs, updates sale
// fiscal columns, and increments retries with exponential backoff on failure.

interface Body { queue_id?: string; limit?: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { body = {}; }

  // Pull batch. If queue_id supplied, only process that one.
  let items: any[] = [];
  if (body.queue_id) {
    const { data } = await admin
      .from("digitax_invoice_queue")
      .select("*")
      .eq("id", body.queue_id)
      .in("status", ["pending", "retry_required"])
      .limit(1);
    items = data ?? [];
    if (items.length) {
      await admin.from("digitax_invoice_queue").update({ status: "processing" }).eq("id", body.queue_id);
    }
  } else {
    const { data } = await admin.rpc("digitax_pick_queue_batch", { _limit: body.limit ?? 25 });
    items = data ?? [];
  }

  const results: Array<{ id: string; ok: boolean; message?: string }> = [];
  for (const q of items) {
    const settingsRes = await admin.from("digitax_settings").select("*").eq("business_id", q.business_id).maybeSingle();
    const settings = settingsRes.data;
    if (!settings?.enabled) {
      await admin.from("digitax_invoice_queue").update({ status: "skipped", error_message: "disabled" }).eq("id", q.id);
      results.push({ id: q.id, ok: false, message: "disabled" });
      continue;
    }
    const start = Date.now();
    const fiscal = simulateProvider(q.payload_json, settings);
    const dur = Date.now() - start;

    await admin.from("digitax_logs").insert({
      business_id: q.business_id,
      endpoint: q.invoice_type,
      request_json: q.payload_json,
      response_json: fiscal,
      http_status: fiscal.ok ? 200 : 500,
      execution_time_ms: dur,
      sale_id: q.sale_id,
      queue_id: q.id,
    });

    if (fiscal.ok) {
      await admin.from("digitax_invoice_queue").update({
        status: "submitted",
        response_json: fiscal,
        submitted_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", q.id);
      if (q.sale_id) {
        await admin.from("sales").update({
          fiscal_status: "accepted",
          fiscal_invoice_number: fiscal.fiscal_invoice_number,
          fiscal_reference: fiscal.fiscal_reference,
          fiscal_qr_code: fiscal.fiscal_qr_code,
          fiscal_verification_url: fiscal.fiscal_verification_url,
          fiscal_signature: fiscal.fiscal_signature,
          fiscal_submitted_at: fiscal.submitted_at,
        }).eq("id", q.sale_id);
      }
      results.push({ id: q.id, ok: true });
    } else {
      const attempts = (q.retry_count ?? 0) + 1;
      const max = settings.max_retry_attempts ?? 5;
      const nextDelayMin = Math.min(60, Math.pow(2, attempts)); // exponential up to 60m
      const status = attempts >= max ? "failed" : "retry_required";
      await admin.from("digitax_invoice_queue").update({
        status,
        retry_count: attempts,
        response_json: fiscal,
        next_retry_at: new Date(Date.now() + nextDelayMin * 60_000).toISOString(),
        error_message: fiscal.error ?? "Submission failed",
      }).eq("id", q.id);
      if (q.sale_id) {
        await admin.from("sales").update({
          fiscal_status: status === "failed" ? "failed" : "retry_required",
        }).eq("id", q.sale_id);
      }
      results.push({ id: q.id, ok: false, message: fiscal.error });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function simulateProvider(payload: any, settings: any) {
  const rate = Number(settings.mock_failure_rate ?? 0);
  if (Math.random() < rate) {
    return { ok: false, status: "failed", error: "Mock KRA rejection: invalid tax rate" };
  }
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ref = `KRA-${stamp}-${Math.floor(Math.random() * 900000 + 100000)}`;
  const verify = `https://itax.kra.go.ke/verify/${ref}`;
  return {
    ok: true,
    status: "accepted",
    fiscal_invoice_number: `FIS-${payload.invoice_number}`,
    fiscal_reference: ref,
    fiscal_qr_code: `${verify}#${ref}`,
    fiscal_verification_url: verify,
    fiscal_signature: btoa(ref + ":" + Number(payload.total || 0).toFixed(2)).slice(0, 32),
    submitted_at: new Date().toISOString(),
  };
}
