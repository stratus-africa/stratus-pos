import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (!barcode || barcode.length < 4 || barcode.length > 128) {
      return json({ error: "Invalid barcode" }, 400);
    }
    if (!/^[0-9]{4,8}$/.test(pin)) {
      return json({ error: "PIN must be 4–8 digits" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: email, error: rpcErr } = await admin.rpc("verify_barcode_pin", {
      _barcode: barcode,
      _pin: pin,
    });
    if (rpcErr) return json({ error: "Verification failed" }, 500);
    if (!email) return json({ error: "Invalid barcode or PIN" }, 401);

    // Generate a magic link and return its hashed token; client calls verifyOtp to establish a session.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: email as string,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: "Could not issue session" }, 500);
    }

    return json({ email, token_hash: link.properties.hashed_token }, 200);
  } catch (e) {
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
