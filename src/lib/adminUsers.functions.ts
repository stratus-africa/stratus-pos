// Thin server-fn wrappers for admin user management (Super Admin or Tenant Admin).
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { adminManageUserInputSchema } from '@/lib/adminUsers.server';

export const adminManageUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(adminManageUserInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { assertBusinessAdminOrSuperAdmin, handleAdminManageUser } = await import('@/lib/adminUsers.server');

    await assertBusinessAdminOrSuperAdmin(context.supabase, supabaseAdmin, context.userId, data.business_id);
    return handleAdminManageUser(supabaseAdmin, context.userId, data);
  });
