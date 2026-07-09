// deno-lint-ignore-file
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// digitax-submit: enqueues a fiscal submission for a completed sale
// (or credit note) and — when the setting is "immediate" — invokes
// digitax-process-queue synchronously so the receipt can show fiscal info.

interface Body {
  sale_id: string;
  invoice_type?: "invoice" | "credit_note";
  original_sale_id?: string;
  wait?: boolean; // when true, run the queue immediately and return updated sale
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const user = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, service);

    const claims = await user.auth.getClaims(authHeader.slice(7));
    if (claims.error || !claims.data?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.data.claims.sub as string;

    const body = (await req.json()) as Body;
    if (!body.sale_id) return json({ error: "sale_id required" }, 400);

    // Load sale + items + business
    const { data: sale, error: saleErr } = await admin
      .from("sales")
      .select("*, customers(*)")
      .eq("id", body.sale_id)
      .maybeSingle();
    if (saleErr || !sale) return json({ error: "Sale not found" }, 404);

    // Auth: user must belong to the business (or super admin)
    const { data: profile } = await admin.from("profiles").select("business_id").eq("id", userId).maybeSingle();
    const { data: superAdmin } = await admin.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (!superAdmin && profile?.business_id !== sale.business_id) {
      return json({ error: "Forbidden" }, 403);
    }

    // Load settings
    const { data: settings } = await admin.from("digitax_settings").select("*").eq("business_id", sale.business_id).maybeSingle();
    if (!settings?.enabled) return json({ skipped: true, reason: "digitax_disabled" });

    // Build items snapshot
    const { data: items } = await admin
      .from("sale_items")
      .select("*, products(name, kra_item_code, hs_code, tax_category)")
      .eq("sale_id", sale.id);

    const payload = {
      business_id: sale.business_id,
      sale_id: sale.id,
      invoice_number: sale.invoice_number,
      invoice_type: body.invoice_type ?? "invoice",
      customer: sale.customers
        ? {
            name: sale.customers.name,
            kra_pin: sale.customers.kra_pin ?? null,
            vat_registered: sale.customers.vat_registered ?? null,
            customer_type: sale.customers.customer_type ?? null,
            tax_exemption_number: sale.customers.tax_exemption_number ?? null,
          }
        : null,
      items: (items ?? []).map((it: any) => ({
        name: it.products?.name ?? "Item",
        kra_item_code: it.products?.kra_item_code ?? null,
        hs_code: it.products?.hs_code ?? null,
        tax_category: it.products?.tax_category ?? null,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        discount: Number(it.discount),
        total: Number(it.total),
      })),
      subtotal: Number(sale.subtotal),
      tax: Number(sale.tax),
      discount: Number(sale.discount),
      total: Number(sale.total),
      currency: settings.default_currency ?? "KES",
      issued_at: sale.created_at,
    };

    // Enqueue
    const { data: queued, error: qErr } = await admin
      .from("digitax_invoice_queue")
      .insert({
        business_id: sale.business_id,
        sale_id: sale.id,
        original_sale_id: body.original_sale_id ?? null,
        invoice_type: body.invoice_type ?? "invoice",
        payload_json: payload,
        status: "pending",
        created_by: userId,
      })
      .select("id")
      .single();
    if (qErr) return json({ error: qErr.message }, 500);

    await admin.from("sales").update({ fiscal_status: "pending_submission" }).eq("id", sale.id);

    if (body.wait) {
      // trigger the processor synchronously
      const invoke = await fetch(`${url}/functions/v1/digitax-process-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
        body: JSON.stringify({ queue_id: queued.id }),
      }).catch(() => null);
      if (invoke) await invoke.text();
      const { data: updated } = await admin
        .from("sales")
        .select("fiscal_status,fiscal_invoice_number,fiscal_reference,fiscal_qr_code,fiscal_verification_url,fiscal_submitted_at")
        .eq("id", sale.id)
        .maybeSingle();
      return json({ queued_id: queued.id, sale: updated });
    }

    return json({ queued_id: queued.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
