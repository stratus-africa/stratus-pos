import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { corsHeaders, paystackFetch } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await supabase.auth.getClaims(token);
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: isSA } = await admin.rpc("is_super_admin", { _user_id: userId });
    if (!isSA) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    const webhookSecret = Deno.env.get("PAYSTACK_WEBHOOK_SECRET") || "";

    const env = secretKey.startsWith("sk_live_") ? "live" : secretKey.startsWith("sk_test_") ? "test" : "unknown";
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/paystack-webhook`;

    let apiOk = false;
    let apiError: string | null = null;
    let merchant: any = null;
    try {
      // /balance is a lightweight endpoint that confirms credentials
      const res = await paystackFetch<any>("/balance");
      apiOk = !!res?.status;
      merchant = res?.data ?? null;
    } catch (e: any) {
      apiError = e?.message || String(e);
    }

    // Look at recent subscription activity as a proxy for webhook deliveries
    const { data: recentSubs } = await admin
      .from("subscriptions")
      .select("id, status, updated_at, current_period_end, paystack_subscription_code")
      .order("updated_at", { ascending: false })
      .limit(5);

    return new Response(
      JSON.stringify({
        ok: true,
        environment: env,
        webhook_url: webhookUrl,
        secret_key_configured: !!secretKey,
        webhook_secret_configured: !!webhookSecret,
        api_ok: apiOk,
        api_error: apiError,
        merchant,
        recent_subscriptions: recentSubs ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
