import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import {
  corsHeaders,
  getPesapalEnvFromSettings,
  pesapalFetch,
} from "../_shared/pesapal.ts";

// Pesapal IPN: invoked when a transaction completes.
// Pesapal sends OrderTrackingId, OrderMerchantReference and OrderNotificationType
// either as query params (GET) or JSON/form body (POST).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let orderTrackingId =
      url.searchParams.get("OrderTrackingId") ||
      url.searchParams.get("orderTrackingId") ||
      undefined;
    let merchantReference =
      url.searchParams.get("OrderMerchantReference") ||
      url.searchParams.get("orderMerchantReference") ||
      undefined;
    let notificationType =
      url.searchParams.get("OrderNotificationType") ||
      url.searchParams.get("orderNotificationType") ||
      "";

    if (!orderTrackingId && req.method !== "GET") {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        orderTrackingId = body.OrderTrackingId || body.orderTrackingId || orderTrackingId;
        merchantReference =
          body.OrderMerchantReference || body.orderMerchantReference || merchantReference;
        notificationType =
          body.OrderNotificationType || body.orderNotificationType || notificationType;
      } else {
        const form = await req.formData().catch(() => null);
        if (form) {
          orderTrackingId =
            (form.get("OrderTrackingId") as string) ||
            (form.get("orderTrackingId") as string) ||
            orderTrackingId;
          merchantReference =
            (form.get("OrderMerchantReference") as string) ||
            (form.get("orderMerchantReference") as string) ||
            merchantReference;
          notificationType =
            (form.get("OrderNotificationType") as string) ||
            (form.get("orderNotificationType") as string) ||
            notificationType;
        }
      }
    }

    if (!orderTrackingId) {
      return ack({ status: 500, message: "Missing OrderTrackingId" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const env = await getPesapalEnvFromSettings(admin);

    // Fetch authoritative status from Pesapal
    const status = await pesapalFetch<any>(
      env,
      `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
      { method: "GET" }
    );

    // Pesapal returns status_code: 0=INVALID, 1=COMPLETED, 2=FAILED, 3=REVERSED
    const statusCode = Number(status?.status_code ?? -1);
    const subToken = status?.subscription_transaction_info?.account_reference || null;

    let newStatus = "pending";
    if (statusCode === 1) newStatus = "active";
    else if (statusCode === 2) newStatus = "past_due";
    else if (statusCode === 3) newStatus = "canceled";

    // Locate the subscription row
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, user_id, product_id, price_id")
      .eq("pesapal_order_tracking_id", orderTrackingId)
      .maybeSingle();

    if (!sub) {
      console.warn("pesapal-ipn: no matching subscription", { orderTrackingId, merchantReference });
      return ack({ status: 200, message: "no matching subscription" });
    }

    const update: Record<string, unknown> = {
      status: newStatus,
      pesapal_subscription_token: subToken,
    };

    if (statusCode === 1) {
      const interval = (sub.price_id || "monthly") as "monthly" | "yearly";
      const now = new Date();
      const periodEnd = new Date(now);
      if (interval === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      else periodEnd.setMonth(periodEnd.getMonth() + 1);
      update.current_period_start = now.toISOString();
      update.current_period_end = periodEnd.toISOString();
      update.cancel_at_period_end = false;
    }

    await admin.from("subscriptions").update(update).eq("id", sub.id);

    return ack({
      orderNotificationType: notificationType,
      orderTrackingId,
      orderMerchantReference: merchantReference,
      status: 200,
    });
  } catch (err) {
    console.error("pesapal-ipn error", err);
    return ack({ status: 500, message: err instanceof Error ? err.message : "error" });
  }
});

function ack(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
