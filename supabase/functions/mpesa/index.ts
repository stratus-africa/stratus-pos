import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { initiateSTKPush, querySTKPushStatus, initiateB2C, formatPhoneNumber } from "../_shared/mpesa.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const body = await req.json();

    const callbackBaseUrl = Deno.env.get("MPESA_CALLBACK_BASE_URL") ||
      `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

    if (action === "stk-push") {
      const { phoneNumber, amount, businessId, saleId, accountReference } = body;

      if (!phoneNumber || !amount || !businessId) {
        return new Response(
          JSON.stringify({ error: "phoneNumber, amount, and businessId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const callbackUrl = `${callbackBaseUrl}/mpesa-callback?type=stk`;

      const result = await initiateSTKPush(
        {
          phoneNumber,
          amount,
          accountReference: accountReference || "Payment",
          transactionDesc: `Payment for ${accountReference || "sale"}`,
          callbackUrl,
        },
        "live"
      );

      // Record in DB
      await supabase.from("mpesa_transactions").insert({
        business_id: businessId,
        sale_id: saleId || null,
        phone_number: formatPhoneNumber(phoneNumber),
        amount,
        type: "stk_push",
        status: "pending",
        checkout_request_id: result.CheckoutRequestID,
        merchant_request_id: result.MerchantRequestID,
        created_by: userId,
      });

      return new Response(
        JSON.stringify({
          success: true,
          checkoutRequestId: result.CheckoutRequestID,
          merchantRequestId: result.MerchantRequestID,
          responseDescription: result.ResponseDescription,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "stk-query") {
      const { checkoutRequestId } = body;
      if (!checkoutRequestId) {
        return new Response(
          JSON.stringify({ error: "checkoutRequestId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await querySTKPushStatus(checkoutRequestId, "live");

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "b2c") {
      const { phoneNumber, amount, businessId, remarks } = body;

      if (!phoneNumber || !amount || !businessId) {
        return new Response(
          JSON.stringify({ error: "phoneNumber, amount, and businessId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const resultUrl = `${callbackBaseUrl}/mpesa-callback?type=b2c`;
      const timeoutUrl = `${callbackBaseUrl}/mpesa-callback?type=b2c-timeout`;

      const result = await initiateB2C(
        {
          phoneNumber,
          amount,
          remarks: remarks || "B2C Payment",
          resultUrl,
          timeoutUrl,
        },
        "live"
      );

      await supabase.from("mpesa_transactions").insert({
        business_id: businessId,
        phone_number: formatPhoneNumber(phoneNumber),
        amount,
        type: "b2c",
        status: "pending",
        conversation_id: result.ConversationID,
        originator_conversation_id: result.OriginatorConversationID,
        created_by: userId,
      });

      return new Response(
        JSON.stringify({
          success: true,
          conversationId: result.ConversationID,
          responseDescription: result.ResponseDescription,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use ?action=stk-push, stk-query, or b2c" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("M-Pesa error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
