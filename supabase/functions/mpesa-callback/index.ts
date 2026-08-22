// Public Daraja webhook. Safaricom cannot send an Authorization header, so this
// function must stay unauthenticated (verify_jwt = false in supabase/config.toml).
// It is safe because it never trusts the payload for money: the amount is checked
// against the stored transaction and all financial writes happen inside the
// atomic `apply_mpesa_stk_result` database function.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Safaricom always expects this shape, even when we could not process the event. */
const accepted = () =>
  new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  try {
    const body = await req.json();
    console.log("M-Pesa callback:", type, JSON.stringify(body));

    if (type === "stk") {
      await handleSTKCallback(body);
    } else if (type === "stk-test") {
      await handleSTKTestCallback(body);
    } else if (type === "b2c") {
      await handleB2CCallback(body);
    } else if (type === "b2c-timeout") {
      await handleB2CTimeout(body);
    } else {
      console.error("Unknown M-Pesa callback type:", type);
    }

    return accepted();
  } catch (error) {
    console.error("Callback error:", error);
    return accepted();
  }
});

function readMetadata(callbackMetadata: any) {
  const out: { amount: number | null; receipt: string | null; phone: string | null; date: string | null } = {
    amount: null,
    receipt: null,
    phone: null,
    date: null,
  };
  const items = callbackMetadata?.Item;
  if (!Array.isArray(items)) return out;

  for (const item of items) {
    switch (item?.Name) {
      case "Amount":
        out.amount = Number(item.Value);
        break;
      case "MpesaReceiptNumber":
        out.receipt = item.Value != null ? String(item.Value) : null;
        break;
      case "TransactionDate":
        out.date = item.Value != null ? String(item.Value) : null;
        break;
      case "PhoneNumber":
        out.phone = item.Value != null ? String(item.Value) : null;
        break;
    }
  }
  return out;
}

async function handleSTKCallback(body: any) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback?.CheckoutRequestID) {
    console.error("Invalid STK callback body");
    return;
  }

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;
  const meta = readMetadata(CallbackMetadata);
  const resultCode = Number(ResultCode);

  // One atomic, idempotent database call performs: amount verification,
  // transaction status update, single payment insert and sale settlement.
  const { data, error } = await supabase.rpc("apply_mpesa_stk_result", {
    _checkout_request_id: String(CheckoutRequestID),
    _result_code: Number.isFinite(resultCode) ? resultCode : -1,
    _result_desc: ResultDesc ? String(ResultDesc) : null,
    _amount: meta.amount,
    _receipt: meta.receipt,
    _phone: meta.phone,
    _transaction_date: meta.date,
  });

  if (error) {
    console.error("apply_mpesa_stk_result failed:", error);
    return;
  }

  console.log(`STK ${CheckoutRequestID} processed:`, JSON.stringify(data));
}

async function handleSTKTestCallback(body: any) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback?.CheckoutRequestID) return;
  const meta = readMetadata(stkCallback.CallbackMetadata);
  const resultCode = Number(stkCallback.ResultCode);
  await supabase.from("mpesa_transactions").update({
    status: resultCode === 0 ? "completed" : "failed",
    result_code: Number.isFinite(resultCode) ? resultCode : -1,
    result_description: stkCallback.ResultDesc ? String(stkCallback.ResultDesc) : null,
    mpesa_receipt_number: meta.receipt,
    updated_at: new Date().toISOString(),
  }).eq("checkout_request_id", String(stkCallback.CheckoutRequestID)).eq("type", "stk_test");
}

async function handleB2CCallback(body: any) {
  const result = body?.Result;
  if (!result) {
    console.error("Invalid B2C callback body");
    return;
  }

  const { ConversationID, OriginatorConversationID, ResultCode, ResultDesc, ResultParameters } = result;

  let transactionId: string | null = null;

  if (ResultParameters?.ResultParameter) {
    for (const param of ResultParameters.ResultParameter) {
      if (param.Key === "TransactionReceipt") transactionId = param.Value;
    }
  }

  const status = ResultCode === 0 ? "completed" : "failed";

  const { error } = await supabase
    .from("mpesa_transactions")
    .update({
      status,
      result_code: ResultCode,
      result_description: ResultDesc,
      mpesa_receipt_number: transactionId,
    })
    .eq("conversation_id", ConversationID);

  if (error) {
    console.error("Error updating B2C transaction:", error);
  }
}

async function handleB2CTimeout(body: any) {
  const result = body?.Result;
  if (!result) return;

  await supabase
    .from("mpesa_transactions")
    .update({
      status: "failed",
      result_description: "Transaction timed out",
    })
    .eq("conversation_id", result.ConversationID);
}
