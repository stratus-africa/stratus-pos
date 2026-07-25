import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const idOrInvoice = url.searchParams.get("id") || "";
    if (!idOrInvoice) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const query = supabase
      .from("sales")
      .select(`
        id, invoice_number, subtotal, tax, discount, total, payment_status, status,
        created_at, business_id, customer_id, location_id,
        fiscal_status, fiscal_invoice_number, fiscal_reference, fiscal_verification_url,
        sale_items ( id, product_id, quantity, unit_price, discount, total ),
        payments ( id, method, amount, reference, created_at )
      `)
      .maybeSingle();

    const { data: sale, error } = uuidRe.test(idOrInvoice)
      ? await query.eq("id", idOrInvoice)
      : await query.eq("invoice_number", idOrInvoice);

    if (error) throw error;
    if (!sale) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: business }, { data: customer }, { data: location }, { data: products }] = await Promise.all([
      supabase.from("businesses").select("id,name,logo_url,address,phone,email,currency,kra_pin").eq("id", sale.business_id).maybeSingle(),
      sale.customer_id
        ? supabase.from("customers").select("id,name,phone,email").eq("id", sale.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("locations").select("id,name,address").eq("id", sale.location_id).maybeSingle(),
      supabase.from("products").select("id,name,sku").in("id", (sale.sale_items || []).map((i: any) => i.product_id)),
    ]);

    const productMap = Object.fromEntries((products || []).map((p: any) => [p.id, p]));
    const items = (sale.sale_items || []).map((i: any) => ({
      ...i,
      product_name: productMap[i.product_id]?.name || "Item",
      product_sku: productMap[i.product_id]?.sku || null,
    }));

    return new Response(JSON.stringify({ sale: { ...sale, sale_items: items }, business, customer, location }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
