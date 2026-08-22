// Thin server-fn wrappers for super-admin tenant management actions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createBusinessInputSchema,
  deleteTenantInputSchema,
  resetTenantInputSchema,
  assignTenantSubscriptionInputSchema,
  updatePlanModulesInputSchema,
} from "@/lib/superAdmin.server";

export const superAdminUpdatePlanModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(updatePlanModulesInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin, handleUpdatePlanModules } = await import("@/lib/superAdmin.server");

    await assertSuperAdmin(supabaseAdmin, context.userId);
    return handleUpdatePlanModules(supabaseAdmin, data);
  });

export const superAdminCreateBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(createBusinessInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin, handleCreateBusiness } = await import("@/lib/superAdmin.server");

    await assertSuperAdmin(supabaseAdmin, context.userId);
    return handleCreateBusiness(supabaseAdmin, data);
  });

export const superAdminDeleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(deleteTenantInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin, handleDeleteTenant } = await import("@/lib/superAdmin.server");

    await assertSuperAdmin(supabaseAdmin, context.userId);
    return handleDeleteTenant(supabaseAdmin, data);
  });

export const superAdminResetTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(resetTenantInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin, handleResetTenant } = await import("@/lib/superAdmin.server");

    await assertSuperAdmin(supabaseAdmin, context.userId);
    return handleResetTenant(supabaseAdmin, data);
  });

export const superAdminAssignTenantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(assignTenantSubscriptionInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin, handleAssignTenantSubscription } = await import("@/lib/superAdmin.server");

    await assertSuperAdmin(supabaseAdmin, context.userId);
    return handleAssignTenantSubscription(supabaseAdmin, data);
  });
