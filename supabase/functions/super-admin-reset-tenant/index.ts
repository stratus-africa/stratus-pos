import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Mode = "transactional" | "full";

type Scope =
  | "sales"
  | "purchases"
  | "expenses"
  | "bank_transactions"
  | "mpesa_transactions"
  | "stock_adjustments"
  | "journal_entries"
  | "pos_sessions"
  | "audit_logs"
  | "product_batches"
  | "inventory_reset";

const ALL_SCOPES: Scope[] = [
  "sales", "purchases", "expenses", "bank_transactions", "mpesa_transactions",
  "stock_adjustments", "journal_entries", "pos_sessions", "audit_logs",
  "product_batches", "inventory_reset",
];

interface Body {
  business_id: string;
  mode: Mode;
  confirm_text: string;
  scopes?: Scope[];
}

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

    const body = (await req.json()) as Body;
    if (!body?.business_id || !body?.mode) return json({ error: "business_id and mode are required" }, 400);
    if (!["transactional", "full"].includes(body.mode)) return json({ error: "Invalid mode" }, 400);
    if ((body.confirm_text || "").trim() !== "RESET") {
      return json({ error: "Confirmation text must be exactly 'RESET'" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const businessId = body.business_id;

    // Verify business exists
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .maybeSingle();
    if (bizErr || !biz) return json({ error: "Business not found" }, 404);

    // Collect ids needed for child-table cascades
    const { data: locations } = await admin.from("locations").select("id").eq("business_id", businessId);
    const locationIds = (locations || []).map((l: { id: string }) => l.id);

    const { data: sales } = await admin.from("sales").select("id").eq("business_id", businessId);
    const saleIds = (sales || []).map((s: { id: string }) => s.id);

    const { data: purchases } = await admin.from("purchases").select("id").eq("business_id", businessId);
    const purchaseIds = (purchases || []).map((p: { id: string }) => p.id);

    const { data: journalEntries } = await admin.from("journal_entries").select("id").eq("business_id", businessId);
    const journalIds = (journalEntries || []).map((j: { id: string }) => j.id);

    const counts: Record<string, number> = {};
    const wipe = async (
      label: string,
      run: () => Promise<{ error: { message: string } | null; count?: number | null }>,
    ) => {
      const { error, count } = await run();
      if (error) throw new Error(`${label}: ${error.message}`);
      counts[label] = count ?? 0;
    };

    // ---- Transactional wipe (always runs) ----
    if (saleIds.length) {
      await wipe("payments", () =>
        admin.from("payments").delete({ count: "exact" }).in("sale_id", saleIds));
      await wipe("sale_items", () =>
        admin.from("sale_items").delete({ count: "exact" }).in("sale_id", saleIds));
    }
    if (purchaseIds.length) {
      await wipe("purchase_items", () =>
        admin.from("purchase_items").delete({ count: "exact" }).in("purchase_id", purchaseIds));
    }
    if (journalIds.length) {
      await wipe("journal_entry_lines", () =>
        admin.from("journal_entry_lines").delete({ count: "exact" }).in("journal_entry_id", journalIds));
    }

    await wipe("bank_transactions", () =>
      admin.from("bank_transactions").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("mpesa_transactions", () =>
      admin.from("mpesa_transactions").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("stock_adjustments", () =>
      admin.from("stock_adjustments").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("expenses", () =>
      admin.from("expenses").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("sales", () =>
      admin.from("sales").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("purchases", () =>
      admin.from("purchases").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("journal_entries", () =>
      admin.from("journal_entries").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("pos_sessions", () =>
      admin.from("pos_sessions").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("audit_logs", () =>
      admin.from("audit_logs").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("product_batches", () =>
      admin.from("product_batches").delete({ count: "exact" }).eq("business_id", businessId));

    if (locationIds.length) {
      // Reset stock to zero for transactional mode (preserves products + locations).
      const { error: invErr } = await admin
        .from("inventory")
        .update({ quantity: 0 })
        .in("location_id", locationIds);
      if (invErr) throw new Error("inventory reset: " + invErr.message);
    }

    if (body.mode === "full") {
      // ---- Full wipe: also remove configuration (keeps business, users + admin role) ----
      if (locationIds.length) {
        await wipe("inventory", () =>
          admin.from("inventory").delete({ count: "exact" }).in("location_id", locationIds));
      }
      await wipe("products", () =>
        admin.from("products").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("customers", () =>
        admin.from("customers").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("suppliers", () =>
        admin.from("suppliers").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("brands", () =>
        admin.from("brands").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("categories", () =>
        admin.from("categories").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("expense_categories", () =>
        admin.from("expense_categories").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("payment_method_accounts", () =>
        admin.from("payment_method_accounts").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("bank_accounts", () =>
        admin.from("bank_accounts").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("chart_of_accounts", () =>
        admin.from("chart_of_accounts").delete({ count: "exact" }).eq("business_id", businessId));
      await wipe("locations", () =>
        admin.from("locations").delete({ count: "exact" }).eq("business_id", businessId));
    }

    return json({
      ok: true,
      mode: body.mode,
      business_id: businessId,
      deleted: counts,
    });
  } catch (err: unknown) {
    console.error("super-admin-reset-tenant error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
