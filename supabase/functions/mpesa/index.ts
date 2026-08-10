import { createClient } from "npm:@supabase/supabase-js@2";
import {
  initiateSTKPush,
  querySTKPushStatus,
  initiateB2C,
  formatPhoneNumber,
  type MpesaCreds,
  type MpesaEnv,
} from "../_shared/mpesa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Safaricom's public sandbox till. Only used when a tenant is on sandbox and
// has not set their own shortcode/passkey. Consumer key/secret are never
// defaulted — they always come from the tenant's vault entries.
const SANDBOX_SHORTCODE = "174379";
const SANDBOX_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

/** 2547XXXXXXXX / 2541XXXXXXXX */
function isValidKenyanPhone(msisdn: string): boolean {
  return /^254(7|1)\d{8}$/.test(msisdn);
}


const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

interface BusinessMpesaConfig {
  creds: MpesaCreds;
  environment: MpesaEnv;
  accountType: "paybill" | "till";
}

async function loadBusinessMpesaConfig(businessId: string | undefined): Promise<BusinessMpesaConfig> {
  if (!businessId) throw new Error("A business is required for M-Pesa payments");

  const [{ data: credentials, error: credentialsError }, { data: business, error: businessError }] = await Promise.all([
    supabase
      .from("business_payment_credentials")
      .select("has_credentials, vault_secret_names")
      .eq("business_id", businessId)
      .eq("provider", "mpesa")
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("mpesa_shortcode, mpesa_environment, mpesa_paybill_or_till")
      .eq("id", businessId)
      .maybeSingle(),
  ]);

  if (credentialsError) throw credentialsError;
  if (businessError) throw businessError;
  if (!business) throw new Error("Business M-Pesa settings were not found");

  const environment: MpesaEnv = business.mpesa_environment === "sandbox" ? "sandbox" : "live";
  const accountType = business.mpesa_paybill_or_till === "till" ? "till" : "paybill";
  const shortcode = business.mpesa_shortcode?.replace(/\D/g, "") || undefined;

  if (!shortcode) throw new Error("M-Pesa shortcode is not configured for this business");
  if (!credentials?.has_credentials || !credentials.vault_secret_names) {
    throw new Error("M-Pesa credentials are not configured for this business");
  }

  const names = credentials.vault_secret_names as {
    consumer_key?: string;
    consumer_secret?: string;
    passkey?: string;
  };

  if (!names.consumer_key || !names.consumer_secret || !names.passkey) {
    throw new Error("M-Pesa credential configuration is incomplete");
  }

  const secretNames = [names.consumer_key, names.consumer_secret, names.passkey];
  const secrets: Record<string, string> = {};

  await Promise.all(
    secretNames.map(async (name) => {
      const { data, error } = await supabase.rpc("read_vault_secret", {
        _name: name,
      });
      if (error) {
        throw new Error(`Could not read stored M-Pesa credentials: ${error.message}`);
      }
      if (typeof data === "string") secrets[name] = data;
    }),
  );

  if (!secrets[names.consumer_key] || !secrets[names.consumer_secret] || !secrets[names.passkey]) {
    throw new Error("Stored M-Pesa credentials are incomplete. Save them again in Settings.");
  }

  return {
    creds: {
      consumerKey: secrets[names.consumer_key],
      consumerSecret: secrets[names.consumer_secret],
      passkey: secrets[names.passkey],
      shortcode,
    },
    environment,
    accountType,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const action = new URL(req.url).searchParams.get("action");
    const body = await req.json();

    const callbackBaseUrl = Deno.env.get("MPESA_CALLBACK_BASE_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

    if (action === "stk-push") {
      const { phoneNumber, amount, businessId, saleId, accountReference } = body;

      if (!phoneNumber || !amount || !businessId) {
        return new Response(JSON.stringify({ error: "phoneNumber, amount, and businessId are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const config = await loadBusinessMpesaConfig(businessId);
      const result = await initiateSTKPush(
        {
          phoneNumber,
          amount,
          accountReference: accountReference || "Payment",
          transactionDesc: `Payment for ${accountReference || "sale"}`,
          callbackUrl: `${callbackBaseUrl}/mpesa-callback?type=stk`,
          accountType: config.accountType,
        },
        config.environment,
        config.creds,
      );

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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "stk-query") {
      const { checkoutRequestId, businessId } = body;
      if (!checkoutRequestId) {
        return new Response(JSON.stringify({ error: "checkoutRequestId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let resolvedBusinessId = businessId;
      if (!resolvedBusinessId) {
        const { data: transaction } = await supabase
          .from("mpesa_transactions")
          .select("business_id")
          .eq("checkout_request_id", checkoutRequestId)
          .maybeSingle();
        resolvedBusinessId = transaction?.business_id;
      }

      const config = await loadBusinessMpesaConfig(resolvedBusinessId);
      const result = await querySTKPushStatus(checkoutRequestId, config.environment, config.creds);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "b2c") {
      const { phoneNumber, amount, businessId, remarks } = body;

      if (!phoneNumber || !amount || !businessId) {
        return new Response(JSON.stringify({ error: "phoneNumber, amount, and businessId are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const config = await loadBusinessMpesaConfig(businessId);
      const result = await initiateB2C(
        {
          phoneNumber,
          amount,
          remarks: remarks || "B2C Payment",
          resultUrl: `${callbackBaseUrl}/mpesa-callback?type=b2c`,
          timeoutUrl: `${callbackBaseUrl}/mpesa-callback?type=b2c-timeout`,
        },
        config.environment,
        config.creds,
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use stk-push, stk-query, or b2c." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("M-Pesa error:", error);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
