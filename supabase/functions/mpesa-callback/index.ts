import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
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
    } else if (type === "b2c") {
      await handleB2CCallback(body);
    } else if (type === "b2c-timeout") {
      await handleB2CTimeout(body);
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Callback error:", error);
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function handleSTKCallback(body: any) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback) {
    console.error("Invalid STK callback body");
    return;
  }

  const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

  let mpesaReceiptNumber: string | null = null;
  let transactionDate: string | null = null;
  let phoneNumber: string | null = null;

  if (CallbackMetadata?.Item) {
    for (const item of CallbackMetadata.Item) {
      if (item.Name === "MpesaReceiptNumber") mpesaReceiptNumber = item.Value;
      if (item.Name === "TransactionDate") transactionDate = String(item.Value);
      if (item.Name === "PhoneNumber") phoneNumber = String(item.Value);
    }
  }

  const status = ResultCode === 0 ? "completed" : "failed";

  const { error } = await supabase
    .from("mpesa_transactions")
    .update({
      status,
      result_code: ResultCode,
      result_description: ResultDesc,
      mpesa_receipt_number: mpesaReceiptNumber,
    })
    .eq("checkout_request_id", CheckoutRequestID);

  if (error) {
    console.error("Error updating STK transaction:", error);
  } else {
    console.log(`STK transaction ${CheckoutRequestID} updated to ${status}`);
  }
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
