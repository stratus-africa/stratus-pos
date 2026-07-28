// Server-only helper logic for admin user management server functions.
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const appRoleSchema = z.enum(['admin', 'manager', 'cashier', 'stores_manager']);

export const adminManageUserInputSchema = z.object({
  action: z.enum(['create_user', 'update_user', 'reset_password', 'set_password', 'delete_user']),
  business_id: z.string(),
  user_id: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  full_name: z.string().optional(),
  phone: z.string().optional(),
  role: appRoleSchema.optional(),
  is_active: z.boolean().optional(),
  assigned_location_id: z.string().nullable().optional(),
});

export type AdminManageUserInput = z.infer<typeof adminManageUserInputSchema>;

export async function assertBusinessAdminOrSuperAdmin(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  callerId: string,
  businessId: string,
) {
  const { data: isSA } = await admin.rpc('is_super_admin', { _user_id: callerId });
  let allowed = !!isSA;
  if (!allowed) {
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('business_id', businessId)
      .eq('role', 'admin')
      .maybeSingle();
    allowed = !!roleRow;
  }
  if (!allowed) {
    throw new Error('Forbidden — admin access required');
  }
}

export async function handleAdminManageUser(admin: any, callerId: string, body: AdminManageUserInput) {
  switch (body.action) {
    case 'create_user': {
      if (!body.email || !body.password || !body.role) {
        return { error: 'email, password and role are required' };
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name || '' },
      });
      if (createErr || !created.user) return { error: createErr?.message || 'Create failed' };
      const newUserId = created.user.id;

      const { error: profErr } = await admin
        .from('profiles')
        .upsert({
          id: newUserId,
          email: body.email,
          full_name: body.full_name || null,
          phone: body.phone || null,
          business_id: body.business_id,
          assigned_location_id: body.assigned_location_id || null,
          is_active: body.is_active ?? true,
        });
      if (profErr) return { error: profErr.message };

      const { error: roleErr } = await admin
        .from('user_roles')
        .insert({ user_id: newUserId, business_id: body.business_id, role: body.role });
      if (roleErr) return { error: roleErr.message };

      return { ok: true, user_id: newUserId };
    }

    case 'update_user': {
      if (!body.user_id) return { error: 'user_id required' };

      if (body.email) {
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          email: body.email,
          user_metadata: { full_name: body.full_name || '' },
        });
        if (error) return { error: error.message };
      }

      const profileUpdate: Record<string, unknown> = {};
      if (body.full_name !== undefined) profileUpdate.full_name = body.full_name;
      if (body.phone !== undefined) profileUpdate.phone = body.phone || null;
      if (body.email !== undefined) profileUpdate.email = body.email;
      if (body.is_active !== undefined) profileUpdate.is_active = body.is_active;
      if (body.assigned_location_id !== undefined)
        profileUpdate.assigned_location_id = body.assigned_location_id || null;

      if (Object.keys(profileUpdate).length > 0) {
        const { error } = await admin.from('profiles').update(profileUpdate).eq('id', body.user_id);
        if (error) return { error: error.message };
      }

      if (body.role) {
        await admin.from('user_roles').delete()
          .eq('user_id', body.user_id).eq('business_id', body.business_id);
        const { error } = await admin.from('user_roles')
          .insert({ user_id: body.user_id, business_id: body.business_id, role: body.role });
        if (error) return { error: error.message };
      }

      return { ok: true };
    }

    case 'set_password': {
      if (!body.user_id || !body.password) return { error: 'user_id and password required' };
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        password: body.password,
      });
      if (error) return { error: error.message };
      return { ok: true };
    }

    case 'reset_password': {
      if (!body.email) return { error: 'email required' };
      const { error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: body.email,
      });
      if (error) return { error: error.message };
      return { ok: true };
    }

    case 'delete_user': {
      if (!body.user_id) return { error: 'user_id required' };
      await admin.from('user_roles').delete()
        .eq('user_id', body.user_id).eq('business_id', body.business_id);
      await admin.from('profiles').update({ business_id: null, is_active: false }).eq('id', body.user_id);
      return { ok: true };
    }

    default:
      return { error: 'Unknown action' };
  }
}
