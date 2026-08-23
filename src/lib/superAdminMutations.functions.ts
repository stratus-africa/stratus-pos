import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant_super_admin"), userId: z.string().uuid() }),
  z.object({ action: z.literal("revoke_super_admin"), userId: z.string().uuid() }),
  z.object({ action: z.literal("toggle_feature_flag"), id: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal("create_feature_flag"), key: z.string().min(1).max(120), label: z.string().min(1).max(160) }),
  z.object({ action: z.literal("save_announcement"), id: z.string().uuid().nullable(), payload: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("toggle_announcement"), id: z.string().uuid(), is_active: z.boolean() }),
  z.object({ action: z.literal("delete_announcement"), id: z.string().uuid() }),
  z.object({ action: z.literal("toggle_module_feature"), id: z.string().uuid(), is_active: z.boolean() }),
  z.object({ action: z.literal("toggle_module"), module_key: z.string().min(1), is_active: z.boolean() }),
  z.object({ action: z.literal("update_tenant"), businessId: z.string().uuid(), payload: z.object({ name: z.string().min(1), currency: z.string().min(1), tax_rate: z.number(), timezone: z.string().min(1), status: z.string().min(1), is_active: z.boolean() }) }),
  z.object({ action: z.literal("toggle_tenant_user"), businessId: z.string().uuid(), userId: z.string().uuid(), is_active: z.boolean() }),
  z.object({ action: z.literal("assign_subscription"), subscriptionId: z.string().uuid(), payload: z.object({ product_id: z.string().uuid(), status: z.string(), cancel_at_period_end: z.boolean(), current_period_end: z.string().nullable().optional() }) }),
  z.object({ action: z.literal("create_subscription"), userId: z.string().uuid(), payload: z.object({ product_id: z.string().uuid(), status: z.string(), environment: z.string(), cancel_at_period_end: z.boolean(), current_period_start: z.string(), current_period_end: z.string().nullable() }) }),
  z.object({ action: z.literal("cancel_subscription"), subscriptionId: z.string().uuid() }),
  z.object({ action: z.literal("update_mpesa_settings"), businessId: z.string().uuid(), payload: z.object({ mpesa_enabled: z.boolean(), mpesa_environment: z.string(), mpesa_shortcode: z.string().nullable(), mpesa_paybill_or_till: z.string(), mpesa_callback_url: z.string().nullable() }) }),
]);

export type SuperAdminMutation = z.infer<typeof mutationSchema>;

export const superAdminMutation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(mutationSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin } = await import("@/lib/superAdmin.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);

    const db = supabaseAdmin as any;
    switch (data.action) {
      case "grant_super_admin":
        if (data.userId === context.userId) throw new Error("You are already a Super Admin");
        await db.from("super_admins").insert({ user_id: data.userId }).throwOnError();
        return { success: true };
      case "revoke_super_admin":
        if (data.userId === context.userId) throw new Error("You cannot remove your own Super Admin status");
        await db.from("super_admins").delete().eq("user_id", data.userId).throwOnError();
        return { success: true };
      case "toggle_feature_flag":
        await db.from("platform_feature_flags").update({ enabled: data.enabled, updated_at: new Date().toISOString() }).eq("id", data.id).throwOnError();
        return { success: true };
      case "create_feature_flag": {
        const { data: row } = await db.from("platform_feature_flags").insert({ key: data.key.trim().toLowerCase().replace(/\s+/g, "_"), label: data.label.trim(), enabled: false }).select().single().throwOnError();
        return row;
      }
      case "save_announcement":
        if (data.id) await db.from("system_announcements").update(data.payload).eq("id", data.id).throwOnError();
        else await db.from("system_announcements").insert(data.payload).throwOnError();
        return { success: true };
      case "toggle_announcement":
        await db.from("system_announcements").update({ is_active: data.is_active }).eq("id", data.id).throwOnError();
        return { success: true };
      case "delete_announcement":
        await db.from("system_announcements").delete().eq("id", data.id).throwOnError();
        return { success: true };
      case "toggle_module_feature":
        await db.from("module_features").update({ is_active: data.is_active }).eq("id", data.id).throwOnError();
        return { success: true };
      case "toggle_module":
        await db.from("module_features").update({ is_active: data.is_active }).eq("module_key", data.module_key).throwOnError();
        return { success: true };
      case "update_tenant":
        await db.from("businesses").update(data.payload).eq("id", data.businessId).throwOnError();
        return { success: true };
      case "toggle_tenant_user":
        const { data: profile } = await db.from("profiles").select("id,business_id").eq("id", data.userId).maybeSingle();
        if (!profile || profile.business_id !== data.businessId) throw new Error("User does not belong to this tenant");
        await db.from("profiles").update({ is_active: data.is_active }).eq("id", data.userId).eq("business_id", data.businessId).throwOnError();
        return { success: true };
      case "assign_subscription":
        await db.from("subscriptions").update(data.payload).eq("id", data.subscriptionId).throwOnError();
        return { success: true };
      case "create_subscription":
        await db.from("subscriptions").upsert({ user_id: data.userId, ...data.payload }, { onConflict: "user_id,environment" }).throwOnError();
        return { success: true };
      case "cancel_subscription":
        await db.from("subscriptions").update({ status: "canceled", cancel_at_period_end: true }).eq("id", data.subscriptionId).throwOnError();
        return { success: true };
      case "update_mpesa_settings":
        await db.from("businesses").update(data.payload).eq("id", data.businessId).throwOnError();
        return { success: true };
    }
  });
