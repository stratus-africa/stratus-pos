import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { corsHeaders, paystackFetch } from "../_shared/paystack.ts";

interface InitBody {
  packageId: string;
  interval: "monthly" | "yearly";
  callbackUrl?: string;
}

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
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("auth.getUser failed", userErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const email = userData.user.email || "";

    const body = (await req.json()) as InitBody;
    if (!body?.packageId || !["monthly", "yearly"].includes(body.interval)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to read package (bypass RLS edge cases)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pkg, error: pkgErr } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("id", body.packageId)
      .maybeSingle();

    if (pkgErr || !pkg) {
      return new Response(JSON.stringify({ error: "Package not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountKes =
      body.interval === "monthly" ? Number(pkg.monthly_price_kes) : Number(pkg.yearly_price_kes);

    if (!amountKes || amountKes <= 0) {
      return new Response(
        JSON.stringify({ error: "This plan has no KES price configured. Ask the platform admin to set it." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let planCode =
      body.interval === "monthly"
        ? pkg.paystack_plan_code_monthly
        : pkg.paystack_plan_code_yearly;

    // Auto-create the Paystack Plan if missing
    if (!planCode) {
      const planRes = await paystackFetch<any>("/plan", {
        method: "POST",
        body: JSON.stringify({
          name: `${pkg.name} (${body.interval})`,
          amount: Math.round(amountKes * 100),
          interval: body.interval === "monthly" ? "monthly" : "annually",
          currency: "KES",
        }),
      });
      planCode = planRes?.data?.plan_code;
      if (!planCode) throw new Error("Failed to create Paystack plan");
      await admin
        .from("subscription_packages")
        .update(
          body.interval === "monthly"
            ? { paystack_plan_code_monthly: planCode }
            : { paystack_plan_code_yearly: planCode }
        )
        .eq("id", pkg.id);
    }

    // Initialize transaction
    const initRes = await paystackFetch<any>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: Math.round(amountKes * 100),
        currency: "KES",
        plan: planCode,
        callback_url: body.callbackUrl,
        metadata: {
          user_id: userId,
          package_id: pkg.id,
          interval: body.interval,
        },
      }),
    });

    return new Response(
      JSON.stringify({
        authorization_url: initRes.data.authorization_url,
        access_code: initRes.data.access_code,
        reference: initRes.data.reference,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("paystack-initialize error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
