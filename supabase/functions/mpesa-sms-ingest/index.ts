import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-mpesa-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) return `254${digits}`;
  return null;
}

function parseMpesaSms(message: string) {
  const text = message.replace(/\s+/g, " ").trim();

  // Common Safaricom confirmation format:
  // TABC123XYZ Confirmed. Ksh1,000.00 received from JOHN DOE 254712345678 on 21/8/26 at 10:00 AM.
  const receipt = text.match(/\b([A-Z0-9]{8,12})\s+Confirmed\b/i)?.[1]?.toUpperCase() ?? null;
  const amountMatch = text.match(/(?:Ksh|KES)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;

  let payerName: string | null = null;
  let senderPhone: string | null = null;
  const fromMatch = text.match(/received from\s+(.+?)(?:\s+(254\d{9}|0\d{9}|\d{9}))\s+on\b/i);
  if (fromMatch) {
    payerName = fromMatch[1].trim().replace(/\s+/g, " ") || null;
    senderPhone = normalizePhone(fromMatch[2]);
  } else {
    const phone = text.match(/\b(254\d{9}|0[17]\d{8})\b/);
    senderPhone = normalizePhone(phone?.[1]);
    const fallbackName = text.match(/received from\s+(.+?)(?:\s+on\b|\.)/i);
    payerName = fallbackName?.[1]?.trim() || null;
  }

  // Keep the parser deliberately conservative. If the SMS is not clearly an
  // M-Pesa receipt, it is stored as unmatched rather than being treated as money.
  const looksLikeMpesa = /confirmed|received from|m-pesa|mpesa/i.test(text) && amount !== null;
  return { receipt, amount, payerName, senderPhone, looksLikeMpesa };
}

function parseTransactionDate(message: string, receivedAt: Date): string | null {
  const match = message.match(/on\s+(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\s+at\s+(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (!match) return null;
  const [, d, m, yRaw, hRaw, min, ampm] = match;
  const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
  let hour = Number(hRaw);
  if (ampm) {
    const upper = ampm.toUpperCase();
    if (upper === "PM" && hour < 12) hour += 12;
    if (upper === "AM" && hour === 12) hour = 0;
  }
  if (!year || Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31 || hour < 0 || hour > 23) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Safaricom SMS timestamps are local Kenya time in normal deployments.
  return `${year}-${pad(Number(m))}-${pad(Number(d))}T${pad(hour)}:${pad(Number(min))}:00+03:00`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const suppliedToken = req.headers.get("x-mpesa-ingest-token") || new URL(req.url).searchParams.get("token");
  if (!suppliedToken) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    const businessId = String(body.business_id || body.businessId || "");
    const sender = body.sender ? String(body.sender) : null;
    const message = String(body.message || body.text || body.body || "").trim();
    const receivedAt = body.received_at ? new Date(body.received_at) : new Date();

    if (!businessId || !message) return json({ error: "business_id and message are required" }, 400);
    if (Number.isNaN(receivedAt.getTime())) return json({ error: "Invalid received_at" }, 400);

    const parsed = parseMpesaSms(message);
    if (!parsed.looksLikeMpesa) {
      return json({ accepted: false, reason: "Message does not look like an M-Pesa payment confirmation" });
    }

    const tokenBytes = new TextEncoder().encode(suppliedToken);
    const tokenDigest = await crypto.subtle.digest("SHA-256", tokenBytes);
    const tokenHash = Array.from(new Uint8Array(tokenDigest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: tokenRow } = await supabase
      .from("mpesa_sms_ingest_tokens")
      .select("token_hash")
      .eq("business_id", businessId)
      .maybeSingle();
    if (!tokenRow?.token_hash || tokenRow.token_hash !== tokenHash) return json({ error: "Unauthorized" }, 401);

    const { data: enabled, error: entitlementError } = await supabase.rpc("business_has_mpesa_feature", {
      _business_id: businessId,
      _feature_key: "mpesa.sms_inbox",
    });
    if (entitlementError) throw entitlementError;
    if (!enabled) return json({ error: "M-Pesa SMS inbox is not enabled for this business plan" }, 403);

    const { data: existing } = parsed.receipt
      ? await supabase
          .from("mpesa_incoming_sms")
          .select("id,status")
          .eq("business_id", businessId)
          .eq("mpesa_receipt_number", parsed.receipt)
          .maybeSingle()
      : { data: null };

    if (existing) {
      return json({ accepted: true, duplicate: true, id: existing.id, status: existing.status });
    }

    const { data, error } = await supabase
      .from("mpesa_incoming_sms")
      .insert({
        business_id: businessId,
        sender,
        sender_phone: parsed.senderPhone,
        message,
        mpesa_receipt_number: parsed.receipt,
        amount: parsed.amount,
        payer_name: parsed.payerName,
        transaction_at: parseTransactionDate(message, receivedAt),
        status: "unmatched",
        received_at: receivedAt.toISOString(),
      })
      .select("id,mpesa_receipt_number,amount,status")
      .single();

    if (error) throw error;
    return json({ accepted: true, duplicate: false, sms: data });
  } catch (error) {
    console.error("M-Pesa SMS ingest error", error);
    return json({ error: error instanceof Error ? error.message : "Failed to ingest SMS" }, 500);
  }
});
