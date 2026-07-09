import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isSA } = await userClient.rpc("is_super_admin", { _user_id: userData.user.id });
    if (!isSA) return json({ error: "Forbidden" }, 403);

    const body = await req.json() as { business_id?: string; confirm_text?: string };
    if (!body?.business_id) return json({ error: "business_id required" }, 400);
    if ((body.confirm_text || "").trim() !== "DELETE") {
      return json({ error: "Confirmation text must be exactly 'DELETE'" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const businessId = body.business_id;

    const { data: biz, error: bizErr } = await admin
      .from("businesses").select("id, name, owner_id").eq("id", businessId).maybeSingle();
    if (bizErr || !biz) return json({ error: "Business not found" }, 404);

    // Collect dependents
    const [{ data: locs }, { data: sales }, { data: purchases }, { data: jes },
           { data: products }, { data: roles }, { data: profs }] = await Promise.all([
      admin.from("locations").select("id").eq("business_id", businessId),
      admin.from("sales").select("id").eq("business_id", businessId),
      admin.from("purchases").select("id").eq("business_id", businessId),
      admin.from("journal_entries").select("id").eq("business_id", businessId),
      admin.from("products").select("id").eq("business_id", businessId),
      admin.from("user_roles").select("user_id").eq("business_id", businessId),
      admin.from("profiles").select("id").eq("business_id", businessId),
    ]);

    const locIds = (locs || []).map((r: any) => r.id);
    const saleIds = (sales || []).map((r: any) => r.id);
    const purchIds = (purchases || []).map((r: any) => r.id);
    const jeIds = (jes || []).map((r: any) => r.id);
    const productIds = (products || []).map((r: any) => r.id);
    const userIds = Array.from(new Set([
      ...(biz.owner_id ? [biz.owner_id] : []),
      ...((roles || []).map((r: any) => r.user_id)),
      ...((profs || []).map((r: any) => r.id)),
    ]));

    const counts: Record<string, number> = {};
    const wipe = async (label: string, run: () => Promise<{ error: any; count?: number | null }>) => {
      const { error, count } = await run();
      if (error) throw new Error(`${label}: ${error.message}`);
      counts[label] = count ?? 0;
    };

    // Children of sales / purchases / journals
    if (saleIds.length) {
      await wipe("payments", () => admin.from("payments").delete({ count: "exact" }).in("sale_id", saleIds));
      await wipe("sale_items", () => admin.from("sale_items").delete({ count: "exact" }).in("sale_id", saleIds));
      await wipe("suspended_sales", () => admin.from("suspended_sales").delete({ count: "exact" }).eq("business_id", businessId));
    }
    if (purchIds.length) {
      await wipe("purchase_items", () => admin.from("purchase_items").delete({ count: "exact" }).in("purchase_id", purchIds));
    }
    if (jeIds.length) {
      await wipe("journal_entry_lines", () => admin.from("journal_entry_lines").delete({ count: "exact" }).in("journal_entry_id", jeIds));
    }
    if (productIds.length) {
      await wipe("product_variants", () => admin.from("product_variants").delete({ count: "exact" }).in("product_id", productIds));
    }

    // Business-scoped tables
    const scoped = [
      "bank_transactions", "mpesa_transactions", "stock_adjustments", "expenses",
      "sales", "purchases", "journal_entries", "pos_sessions", "audit_logs",
      "product_batches", "payment_method_accounts", "bank_accounts", "tax_rates",
      "expense_categories", "chart_of_accounts", "suspended_sales", "tills",
      "offline_payment_requests", "business_payment_credentials", "tenant_domains",
      "role_permissions", "brands", "categories", "units", "customers", "suppliers",
      "products",
    ];
    for (const t of scoped) {
      try {
        await wipe(t, () => admin.from(t as any).delete({ count: "exact" }).eq("business_id", businessId));
      } catch (e) {
        console.warn(`skip ${t}: ${(e as Error).message}`);
      }
    }

    if (locIds.length) {
      await wipe("inventory", () => admin.from("inventory").delete({ count: "exact" }).in("location_id", locIds));
    }
    await wipe("locations", () => admin.from("locations").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("user_roles", () => admin.from("user_roles").delete({ count: "exact" }).eq("business_id", businessId));

    // Detach then remove profiles for tenant users
    if (userIds.length) {
      await admin.from("profiles").update({ business_id: null }).in("id", userIds);
      // Subscriptions belonging to tenant users
      await wipe("subscriptions", () => admin.from("subscriptions").delete({ count: "exact" }).in("user_id", userIds));
    }

    // Delete the business
    const { error: bizDelErr } = await admin.from("businesses").delete().eq("id", businessId);
    if (bizDelErr) throw new Error(`businesses: ${bizDelErr.message}`);
    counts["businesses"] = 1;

    // Delete tenant profiles + auth users (skip super admins)
    if (userIds.length) {
      const { data: sas } = await admin.from("super_admins").select("user_id").in("user_id", userIds);
      const saSet = new Set((sas || []).map((r: any) => r.user_id));
      const deletable = userIds.filter((u) => !saSet.has(u));

      if (deletable.length) {
        await admin.from("profiles").delete().in("id", deletable);
        for (const uid of deletable) {
          const { error } = await admin.auth.admin.deleteUser(uid);
          if (error) console.warn(`auth delete ${uid}: ${error.message}`);
        }
        counts["auth_users"] = deletable.length;
      }
    }

    return json({ ok: true, business_id: businessId, deleted: counts });
  } catch (err: unknown) {
    console.error("super-admin-delete-tenant error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
