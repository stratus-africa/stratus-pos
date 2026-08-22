import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { corsHeaders, paystackFetch, verifyPaystackSignature } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const valid = await verifyPaystackSignature(rawBody, signature);
  if (!valid) {
    console.warn("Invalid Paystack signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const env = (Deno.env.get("PAYSTACK_SECRET_KEY") || "").startsWith("sk_test_") ? "sandbox" : "live";

  try {
    const type = event.event as string;
    const data = event.data ?? {};

    if (type === "charge.success") {
      const meta = data.metadata || {};
      const userId = meta.user_id as string | undefined;
      const packageId = meta.package_id as string | undefined;
      const interval = meta.interval as "monthly" | "yearly" | undefined;
      const customerCode = data.customer?.customer_code as string | undefined;
      const customerEmail = data.customer?.email as string | undefined;
      const planCode = data.plan?.plan_code as string | undefined;

      if (userId) {
        const { data: pkg } = packageId
          ? await admin
              .from("subscription_packages")
              .select("id, monthly_price_kes, yearly_price_kes, paystack_plan_code_monthly, paystack_plan_code_yearly")
              .eq("id", packageId)
              .maybeSingle()
          : { data: null };
        const expected =
          pkg && interval
            ? Math.round(Number(interval === "yearly" ? pkg.yearly_price_kes : pkg.monthly_price_kes) * 100)
            : 0;
        const received = Number(data.amount || 0);
        if (!pkg || !interval || !expected || received !== expected || String(data.currency || "") !== "KES") {
          console.warn("Paystack webhook rejected charge: amount/currency/package mismatch", {
            reference: data.reference,
          });
        } else {
          const now = new Date();
          const periodEnd = new Date(now);
          if (interval === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          else periodEnd.setMonth(periodEnd.getMonth() + 1);

          const { data: existing } = await admin
            .from("subscriptions")
            .select("id")
            .eq("user_id", userId)
            .eq("environment", env)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const payload: any = {
            user_id: userId,
            environment: env,
            status: "active",
            paystack_customer_code: customerCode,
            plan_code: planCode,
            product_id: packageId || "",
            price_id: interval || "",
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            cancel_at_period_end: false,
          };

          if (existing) {
            await admin.from("subscriptions").update(payload).eq("id", existing.id);
          } else {
            await admin.from("subscriptions").insert(payload);
          }
        }
      }
    } else if (type === "subscription.create") {
      const customerCode = data.customer?.customer_code;
      const subscriptionCode = data.subscription_code;
      const planCode = data.plan?.plan_code;
      const nextPayment = data.next_payment_date;
      const customerEmail = data.customer?.email;

      // Find the most recent active subscription for this customer and attach the subscription_code
      if (customerCode) {
        await admin
          .from("subscriptions")
          .update({
            paystack_subscription_code: subscriptionCode,
            paystack_email_token: data.email_token,
            plan_code: planCode,
            current_period_end: nextPayment,
            status: "active",
          })
          .eq("paystack_customer_code", customerCode);
      }
    } else if (type === "subscription.disable" || type === "subscription.not_renew") {
      const subscriptionCode = data.subscription_code;
      if (subscriptionCode) {
        await admin
          .from("subscriptions")
          .update({
            status: type === "subscription.disable" ? "canceled" : "active",
            cancel_at_period_end: type === "subscription.not_renew",
          })
          .eq("paystack_subscription_code", subscriptionCode);
      }
    } else if (type === "invoice.payment_failed") {
      const subscriptionCode = data.subscription?.subscription_code;
      if (subscriptionCode) {
        await admin
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("paystack_subscription_code", subscriptionCode);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("paystack-webhook error", err);
    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
