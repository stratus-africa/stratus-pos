import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import {
  corsHeaders,
  getOrRegisterIpn,
  getPesapalEnvFromSettings,
  pesapalFetch,
} from "../_shared/pesapal.ts";

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
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const userId = userData.user.id;
    const email = userData.user.email || "";

    const body = (await req.json()) as InitBody;
    if (!body?.packageId || !["monthly", "yearly"].includes(body.interval)) {
      return json({ error: "Invalid request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const env = await getPesapalEnvFromSettings(admin);

    const { data: pkg, error: pkgErr } = await admin
      .from("subscription_packages")
      .select("*")
      .eq("id", body.packageId)
      .maybeSingle();
    if (pkgErr || !pkg) return json({ error: "Package not found" }, 404);

    const amountKes =
      body.interval === "monthly"
        ? Number(pkg.monthly_price_kes)
        : Number(pkg.yearly_price_kes);
    if (!amountKes || amountKes <= 0) {
      return json({ error: "This plan has no KES price configured." }, 400);
    }

    // Resolve IPN id (auto-register on first use)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const ipnId = await getOrRegisterIpn(env, supabaseUrl, admin);

    // Build a unique merchant reference so we can reconcile via webhook
    const merchantReference = `sub_${userId.slice(0, 8)}_${Date.now()}`;

    // Profile for billing details
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .maybeSingle();

    const [firstName, ...rest] = (profile?.full_name || "").split(" ");
    const lastName = rest.join(" ").trim();

    const callbackUrl =
      body.callbackUrl ||
      `${req.headers.get("origin") || ""}/settings?tab=subscription&checkout=success`;

    const orderPayload: Record<string, unknown> = {
      id: merchantReference,
      currency: "KES",
      amount: Number(amountKes.toFixed(2)),
      description: `${pkg.name} (${body.interval})`,
      callback_url: callbackUrl,
      notification_id: ipnId,
      billing_address: {
        email_address: email,
        first_name: firstName || "Customer",
        last_name: lastName || "",
        phone_number: profile?.phone || "",
      },
      // Recurring details — Pesapal will auto-debit on schedule
      account_number: userId,
      subscription_details: {
        start_date: formatDate(new Date()),
        end_date: formatDate(addYears(new Date(), 5)),
        frequency: body.interval === "monthly" ? "MONTHLY" : "YEARLY",
      },
    };

    const order = await pesapalFetch<any>(env, "/api/Transactions/SubmitOrderRequest", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });

    if (order?.error || !order?.redirect_url) {
      return json({ error: order?.error?.message || "Failed to create order", details: order }, 502);
    }

    // Pre-create / upsert a pending subscription row so we can reconcile in IPN
    const { data: existing } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("environment", env)
      .maybeSingle();

    const subPayload: Record<string, unknown> = {
      user_id: userId,
      environment: env,
      status: "pending",
      payment_provider: "pesapal",
      pesapal_order_tracking_id: order.order_tracking_id,
      pesapal_merchant_reference: merchantReference,
      product_id: body.packageId,
      price_id: body.interval,
    };

    if (existing) {
      await admin.from("subscriptions").update(subPayload).eq("id", existing.id);
    } else {
      await admin.from("subscriptions").insert(subPayload);
    }

    return json({
      redirect_url: order.redirect_url,
      order_tracking_id: order.order_tracking_id,
      merchant_reference: merchantReference,
    });
  } catch (err) {
    console.error("pesapal-initialize error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDate(d: Date) {
  // dd-MM-yyyy as required by Pesapal subscription_details
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function addYears(d: Date, years: number) {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + years);
  return r;
}
