// Server-only helper logic for super-admin server functions.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertSuperAdmin(admin: SupabaseClient, callerId: string) {
  const { data: isSA } = await admin.rpc("is_super_admin", { _user_id: callerId });
  if (!isSA) throw new Error("Forbidden");
}

// ---------------- create-business ----------------

export const createBusinessInputSchema = z.object({
  businessName: z.string(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  taxRate: z.number().optional(),
  ownerFullName: z.string(),
  ownerEmail: z.string(),
  ownerPassword: z.string(),
  locationName: z.string().optional(),
  packageId: z.string().nullable().optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessInputSchema>;

async function waitForAuthUser(admin: any, userId: string, maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data?.user?.id === userId) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export async function handleCreateBusiness(admin: any, body: CreateBusinessInput) {
  const requiredOk =
    body?.businessName?.trim() &&
    body?.ownerFullName?.trim() &&
    body?.ownerEmail?.trim() &&
    body?.ownerPassword &&
    body.ownerPassword.length >= 6;

  if (!requiredOk) {
    return { error: "Missing required fields (business name, owner name/email, password ≥ 6 chars)" };
  }

  const { data: createdUser, error: userErr } = await admin.auth.admin.createUser({
    email: body.ownerEmail.trim().toLowerCase(),
    password: body.ownerPassword,
    email_confirm: true,
    user_metadata: { full_name: body.ownerFullName.trim() },
  });
  if (userErr || !createdUser?.user) {
    return { error: userErr?.message || "Failed to create user" };
  }
  const newUserId = createdUser.user.id;

  const visible = await waitForAuthUser(admin, newUserId);
  if (!visible) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    return { error: "Auth user creation timed out — please retry" };
  }

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .insert({
      name: body.businessName.trim(),
      currency: body.currency || "KES",
      timezone: body.timezone || "Africa/Nairobi",
      tax_rate: body.taxRate ?? 16,
      owner_id: newUserId,
    })
    .select()
    .single();
  if (bizErr || !biz) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    return { error: bizErr?.message || "Failed to create business" };
  }

  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: newUserId,
      business_id: biz.id,
      full_name: body.ownerFullName.trim(),
      email: body.ownerEmail.trim().toLowerCase(),
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    console.error("profile upsert failed", profileErr);
  }

  let roleErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.from("user_roles").insert({
      user_id: newUserId,
      role: "admin",
      business_id: biz.id,
    });
    if (!error) {
      roleErr = null;
      break;
    }
    roleErr = error;
    const msg = (error as { message?: string })?.message || "";
    if (!msg.includes("user_roles_user_id_fkey")) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (roleErr) {
    await admin
      .from("businesses")
      .delete()
      .eq("id", biz.id)
      .catch(() => {});
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    const msg = (roleErr as { message?: string })?.message || "Failed to assign role";
    return { error: msg };
  }

  await admin.from("locations").insert({
    business_id: biz.id,
    name: body.locationName?.trim() || "Main Store",
    type: "store",
  });

  if (body.packageId) {
    const { data: pkg } = await admin.from("subscription_packages").select("*").eq("id", body.packageId).maybeSingle();
    if (pkg) {
      const env = (process.env.PAYSTACK_SECRET_KEY || "").startsWith("sk_test_") ? "sandbox" : "live";
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const { error: subErr } = await admin.from("subscriptions").insert({
        user_id: newUserId,
        environment: env,
        status: "active",
        product_id: pkg.id.toString(),
        price_id: "manual_assign",
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
      });
      if (subErr) {
        console.error("Failed to create subscription:", subErr);
        return { error: `Business created but subscription assignment failed: ${subErr.message}` };
      }
    }
  }

  return {
    ok: true,
    business: { id: biz.id, name: biz.name },
    owner: { id: newUserId, email: body.ownerEmail },
  };
}

// ---------------- delete-tenant ----------------

export const deleteTenantInputSchema = z.object({
  business_id: z.string(),
  confirm_text: z.string().optional(),
});
export type DeleteTenantInput = z.infer<typeof deleteTenantInputSchema>;

export async function handleDeleteTenant(admin: any, body: DeleteTenantInput) {
  if (!body?.business_id) return { error: "business_id required" };
  if ((body.confirm_text || "").trim() !== "DELETE") {
    return { error: "Confirmation text must be exactly 'DELETE'" };
  }

  const businessId = body.business_id;

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, name, owner_id")
    .eq("id", businessId)
    .maybeSingle();
  if (bizErr || !biz) return { error: "Business not found" };

  const [
    { data: locs },
    { data: sales },
    { data: purchases },
    { data: jes },
    { data: products },
    { data: roles },
    { data: profs },
  ] = await Promise.all([
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
  const userIds = Array.from(
    new Set([
      ...(biz.owner_id ? [biz.owner_id] : []),
      ...(roles || []).map((r: any) => r.user_id),
      ...(profs || []).map((r: any) => r.id),
    ]),
  );

  const counts: Record<string, number> = {};
  const wipe = async (label: string, run: () => Promise<{ error: any; count?: number | null }>) => {
    const { error, count } = await run();
    if (error) throw new Error(`${label}: ${error.message}`);
    counts[label] = count ?? 0;
  };

  if (saleIds.length) {
    await wipe("payments", () => admin.from("payments").delete({ count: "exact" }).in("sale_id", saleIds));
    await wipe("sale_items", () => admin.from("sale_items").delete({ count: "exact" }).in("sale_id", saleIds));
    await wipe("suspended_sales", () =>
      admin.from("suspended_sales").delete({ count: "exact" }).eq("business_id", businessId),
    );
  }
  if (purchIds.length) {
    await wipe("purchase_items", () =>
      admin.from("purchase_items").delete({ count: "exact" }).in("purchase_id", purchIds),
    );
  }
  if (jeIds.length) {
    await wipe("journal_entry_lines", () =>
      admin.from("journal_entry_lines").delete({ count: "exact" }).in("journal_entry_id", jeIds),
    );
  }
  if (productIds.length) {
    await wipe("product_variants", () =>
      admin.from("product_variants").delete({ count: "exact" }).in("product_id", productIds),
    );
  }

  // stock_adjustments has no business_id: it is scoped by location.
  if (locIds.length) {
    try {
      await wipe("stock_adjustments", () =>
        admin.from("stock_adjustments").delete({ count: "exact" }).in("location_id", locIds),
      );
    } catch (e) {
      console.warn(`skip stock_adjustments: ${(e as Error).message}`);
    }
  }

  const scoped = [
    "stock_adjustment_documents",
    "bank_transactions",
    "mpesa_transactions",
    "expenses",
    "sales",
    "purchases",
    "journal_entries",
    "pos_sessions",
    "audit_logs",
    "product_batches",
    "payment_method_accounts",
    "bank_accounts",
    "tax_rates",
    "expense_categories",
    "chart_of_accounts",
    "suspended_sales",
    "tills",
    "offline_payment_requests",
    "business_payment_credentials",
    "tenant_domains",
    "role_permissions",
    "brands",
    "categories",
    "units",
    "customers",
    "suppliers",
    "products",
  ];
  for (const t of scoped) {
    try {
      await wipe(t, () =>
        admin
          .from(t as any)
          .delete({ count: "exact" })
          .eq("business_id", businessId),
      );
    } catch (e) {
      console.warn(`skip ${t}: ${(e as Error).message}`);
    }
  }

  if (locIds.length) {
    await wipe("inventory", () => admin.from("inventory").delete({ count: "exact" }).in("location_id", locIds));
  }
  await wipe("locations", () => admin.from("locations").delete({ count: "exact" }).eq("business_id", businessId));
  await wipe("user_roles", () => admin.from("user_roles").delete({ count: "exact" }).eq("business_id", businessId));

  if (userIds.length) {
    await admin.from("profiles").update({ business_id: null }).in("id", userIds);
    await wipe("subscriptions", () => admin.from("subscriptions").delete({ count: "exact" }).in("user_id", userIds));
  }

  const { error: hardDeleteErr } = await admin.rpc("hard_delete_business", { _business_id: businessId });
  if (hardDeleteErr) throw new Error(`hard_delete_business: ${hardDeleteErr.message}`);
  counts["businesses"] = 1;

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

  return { ok: true, business_id: businessId, deleted: counts };
}

// ---------------- reset-tenant ----------------

const modeSchema = z.enum(["transactional", "full"]);
const scopeSchema = z.enum([
  "sales",
  "purchases",
  "expenses",
  "bank_transactions",
  "mpesa_transactions",
  "stock_adjustments",
  "journal_entries",
  "pos_sessions",
  "audit_logs",
  "product_batches",
  "inventory_reset",
]);

export const resetTenantInputSchema = z.object({
  business_id: z.string(),
  mode: modeSchema,
  confirm_text: z.string(),
  scopes: z.array(scopeSchema).optional(),
});
export type ResetTenantInput = z.infer<typeof resetTenantInputSchema>;
type Scope = z.infer<typeof scopeSchema>;

const ALL_SCOPES: Scope[] = [
  "sales",
  "purchases",
  "expenses",
  "bank_transactions",
  "mpesa_transactions",
  "stock_adjustments",
  "journal_entries",
  "pos_sessions",
  "audit_logs",
  "product_batches",
  "inventory_reset",
];

export async function handleResetTenant(admin: any, body: ResetTenantInput) {
  if (!body?.business_id || !body?.mode) return { error: "business_id and mode are required" };
  if (!["transactional", "full"].includes(body.mode)) return { error: "Invalid mode" };
  if ((body.confirm_text || "").trim() !== "RESET") {
    return { error: "Confirmation text must be exactly 'RESET'" };
  }

  const businessId = body.business_id;

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .maybeSingle();
  if (bizErr || !biz) return { error: "Business not found" };

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

  const requestedScopes: Scope[] =
    body.mode === "full"
      ? ALL_SCOPES
      : Array.isArray(body.scopes) && body.scopes.length > 0
        ? body.scopes.filter((s): s is Scope => ALL_SCOPES.includes(s as Scope))
        : ALL_SCOPES;
  const scopeSet = new Set<Scope>(requestedScopes);

  if (scopeSet.has("sales") && saleIds.length) {
    await wipe("payments", () => admin.from("payments").delete({ count: "exact" }).in("sale_id", saleIds));
    await wipe("sale_items", () => admin.from("sale_items").delete({ count: "exact" }).in("sale_id", saleIds));
  }
  if (scopeSet.has("purchases") && purchaseIds.length) {
    await wipe("purchase_items", () =>
      admin.from("purchase_items").delete({ count: "exact" }).in("purchase_id", purchaseIds),
    );
  }
  if (scopeSet.has("journal_entries") && journalIds.length) {
    await wipe("journal_entry_lines", () =>
      admin.from("journal_entry_lines").delete({ count: "exact" }).in("journal_entry_id", journalIds),
    );
  }

  if (scopeSet.has("bank_transactions")) {
    await wipe("bank_transactions", () =>
      admin.from("bank_transactions").delete({ count: "exact" }).eq("business_id", businessId),
    );
  }
  if (scopeSet.has("mpesa_transactions")) {
    await wipe("mpesa_transactions", () =>
      admin.from("mpesa_transactions").delete({ count: "exact" }).eq("business_id", businessId),
    );
  }
  if (scopeSet.has("stock_adjustments")) {
    // stock_adjustments is scoped by location, not business_id.
    if (locationIds.length) {
      await wipe("stock_adjustments", () =>
        admin.from("stock_adjustments").delete({ count: "exact" }).in("location_id", locationIds),
      );
    }
    await wipe("stock_adjustment_documents", () =>
      admin.from("stock_adjustment_documents").delete({ count: "exact" }).eq("business_id", businessId),
    );
  }
  if (scopeSet.has("expenses")) {
    await wipe("expenses", () => admin.from("expenses").delete({ count: "exact" }).eq("business_id", businessId));
  }
  if (scopeSet.has("sales")) {
    await wipe("sales", () => admin.from("sales").delete({ count: "exact" }).eq("business_id", businessId));
  }
  if (scopeSet.has("purchases")) {
    await wipe("purchases", () => admin.from("purchases").delete({ count: "exact" }).eq("business_id", businessId));
  }
  if (scopeSet.has("journal_entries")) {
    await wipe("journal_entries", () =>
      admin.from("journal_entries").delete({ count: "exact" }).eq("business_id", businessId),
    );
  }
  if (scopeSet.has("pos_sessions")) {
    await wipe("pos_sessions", () =>
      admin.from("pos_sessions").delete({ count: "exact" }).eq("business_id", businessId),
    );
  }
  if (scopeSet.has("audit_logs")) {
    await wipe("audit_logs", () => admin.from("audit_logs").delete({ count: "exact" }).eq("business_id", businessId));
  }
  if (scopeSet.has("product_batches")) {
    await wipe("product_batches", () =>
      admin.from("product_batches").delete({ count: "exact" }).eq("business_id", businessId),
    );
  }

  if (scopeSet.has("inventory_reset") && locationIds.length) {
    const { error: invErr } = await admin.from("inventory").update({ quantity: 0 }).in("location_id", locationIds);
    if (invErr) throw new Error("inventory reset: " + invErr.message);
    counts["inventory_reset"] = locationIds.length;
  }

  if (body.mode === "full") {
    if (locationIds.length) {
      await wipe("inventory", () => admin.from("inventory").delete({ count: "exact" }).in("location_id", locationIds));
    }
    await wipe("products", () => admin.from("products").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("customers", () => admin.from("customers").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("suppliers", () => admin.from("suppliers").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("brands", () => admin.from("brands").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("categories", () => admin.from("categories").delete({ count: "exact" }).eq("business_id", businessId));
    await wipe("expense_categories", () =>
      admin.from("expense_categories").delete({ count: "exact" }).eq("business_id", businessId),
    );
    await wipe("payment_method_accounts", () =>
      admin.from("payment_method_accounts").delete({ count: "exact" }).eq("business_id", businessId),
    );
    await wipe("bank_accounts", () =>
      admin.from("bank_accounts").delete({ count: "exact" }).eq("business_id", businessId),
    );
    await wipe("chart_of_accounts", () =>
      admin.from("chart_of_accounts").delete({ count: "exact" }).eq("business_id", businessId),
    );
    await wipe("locations", () => admin.from("locations").delete({ count: "exact" }).eq("business_id", businessId));
  }

  return {
    ok: true,
    mode: body.mode,
    business_id: businessId,
    deleted: counts,
  };
}

// ---------------- assign-tenant-subscription ----------------

export const assignTenantSubscriptionInputSchema = z.object({
  business_id: z.string(),
  package_id: z.string().nullable().optional(),
  duration_months: z.number().int().positive().optional(),
});
export type AssignTenantSubscriptionInput = z.infer<typeof assignTenantSubscriptionInputSchema>;

export async function handleAssignTenantSubscription(admin: any, body: AssignTenantSubscriptionInput) {
  if (!body?.business_id) {
    return { error: "business_id is required" };
  }

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, owner_id")
    .eq("id", body.business_id)
    .maybeSingle();
  if (bizErr || !biz) {
    return { error: "Business not found" };
  }

  if (!biz.owner_id) {
    return { error: "Business has no owner" };
  }

  // If package_id is null, just cancel any existing subscription
  if (body.package_id === null) {
    const { error: updateErr } = await admin
      .from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: true })
      .eq("user_id", biz.owner_id);
    if (updateErr) {
      return { error: `Failed to cancel subscription: ${updateErr.message}` };
    }
    return { ok: true, message: "Subscription canceled" };
  }

  // Verify package exists
  const { data: pkg, error: pkgErr } = await admin
    .from("subscription_packages")
    .select("*")
    .eq("id", body.package_id)
    .maybeSingle();
  if (pkgErr || !pkg) {
    return { error: "Package not found" };
  }

  const env = (process.env.PAYSTACK_SECRET_KEY || "").startsWith("sk_test_") ? "sandbox" : "live";

  const periodStart = new Date();
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + (body.duration_months ?? 1));

  // Check if subscription already exists
  const { data: existingSub, error: existingErr } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", biz.owner_id)
    .eq("environment", env)
    .maybeSingle();

  let subError: any = null;
  if (existingSub) {
    // Update existing subscription
    const { error } = await admin
      .from("subscriptions")
      .update({
        product_id: pkg.id.toString(),
        status: "active",
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
      })
      .eq("id", existingSub.id);
    subError = error;
  } else {
    // Create new subscription
    const { error } = await admin.from("subscriptions").insert({
      user_id: biz.owner_id,
      environment: env,
      status: "active",
      product_id: pkg.id.toString(),
      price_id: "manual_assign",
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    });
    subError = error;
  }

  if (subError) {
    console.error("Failed to assign subscription:", subError);
    return { error: `Failed to assign subscription: ${subError.message}` };
  }

  return {
    ok: true,
    message: "Subscription assigned successfully",
    business_id: biz.id,
    package_id: pkg.id,
    period_end: periodEnd.toISOString(),
  };
}
