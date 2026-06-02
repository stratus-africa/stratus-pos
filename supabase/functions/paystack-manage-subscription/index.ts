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
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("auth.getUser failed", userErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { action, subscriptionId } = (await req.json().catch(() => ({}))) as {
      action?: string;
      subscriptionId?: string;
    };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If a subscriptionId is supplied, verify the caller is a super admin and target that row.
    let sub: any = null;
    if (subscriptionId) {
      const { data: isAdmin } = await admin.rpc("is_super_admin", { _user_id: userId });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await admin
        .from("subscriptions")
        .select("*")
        .eq("id", subscriptionId)
        .maybeSingle();
      sub = data;
    } else {
      const { data } = await admin
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      sub = data;
    }

    // Super-admin cancel for comp/free plans (no Paystack code): just mark cancelled.
    if (action === "cancel" && subscriptionId && sub && !sub.paystack_subscription_code) {
      await admin
        .from("subscriptions")
        .update({ status: "canceled", cancel_at_period_end: true })
        .eq("id", sub.id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sub?.paystack_subscription_code || !sub?.paystack_email_token) {
      return new Response(JSON.stringify({ error: "No active subscription" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel") {
      await paystackFetch("/subscription/disable", {
        method: "POST",
        body: JSON.stringify({
          code: sub.paystack_subscription_code,
          token: sub.paystack_email_token,
        }),
      });
      await admin
        .from("subscriptions")
        .update({ cancel_at_period_end: true })
        .eq("id", sub.id);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: return the manage link
    const linkRes = await paystackFetch<any>(
      `/subscription/${sub.paystack_subscription_code}/manage/link`
    );
    return new Response(JSON.stringify({ url: linkRes?.data?.link }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("paystack-manage-subscription error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
