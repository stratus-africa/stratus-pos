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

  const { data: updated, error } = await supabase
    .from("mpesa_transactions")
    .update({
      status,
      result_code: ResultCode,
      result_description: ResultDesc,
      mpesa_receipt_number: mpesaReceiptNumber,
    })
    .eq("checkout_request_id", CheckoutRequestID)
    .select("id, sale_id, amount, mpesa_receipt_number")
    .maybeSingle();

  if (error) {
    console.error("Error updating STK transaction:", error);
    return;
  }

  console.log(`STK transaction ${CheckoutRequestID} updated to ${status}`);

  if (status === "completed" && updated?.sale_id) {
    await reconcileSalePayment(updated.sale_id, Number(updated.amount), updated.mpesa_receipt_number ?? CheckoutRequestID);
  }
}

/**
 * Records the M-Pesa receipt against the sale and flips the sale's
 * payment_status once the recorded payments cover the sale total.
 */
async function reconcileSalePayment(saleId: string, amount: number, reference: string) {
  try {
    const { data: existing } = await supabase
      .from("payments")
      .select("id, amount, reference")
      .eq("sale_id", saleId);

    const already = (existing || []).some((p: any) => p.reference && p.reference === reference);
    if (!already) {
      const { error: payErr } = await supabase
        .from("payments")
        .insert({ sale_id: saleId, method: "mpesa", amount, reference });
      if (payErr) {
        console.error("Error inserting payment:", payErr);
        return;
      }
    }

    const { data: sale } = await supabase
      .from("sales")
      .select("id, total, payment_status")
      .eq("id", saleId)
      .maybeSingle();
    if (!sale) return;

    const paid =
      (existing || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0) +
      (already ? 0 : amount);

    const nextStatus = paid + 0.01 >= Number(sale.total) ? "paid" : "partial";
    if (sale.payment_status !== nextStatus) {
      const { error: saleErr } = await supabase
        .from("sales")
        .update({ payment_status: nextStatus })
        .eq("id", saleId);
      if (saleErr) console.error("Error updating sale payment_status:", saleErr);
      else console.log(`Sale ${saleId} marked ${nextStatus} (paid ${paid} of ${sale.total})`);
    }
  } catch (e) {
    console.error("reconcileSalePayment failed:", e);
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
