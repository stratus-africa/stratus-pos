import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const userIdSchema = z.object({ userId: z.string().uuid() });
const requestSchema = z.object({ actionKey: z.string().min(2), targetType: z.string().min(1), targetId: z.string().uuid().nullable().optional(), reason: z.string().min(8), riskLevel: z.enum(['high','critical']).default('high') });

export const revokeUserSessions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(userIdSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { assertSuperAdmin } = await import('@/lib/superAdmin.server');
    await assertSuperAdmin(supabaseAdmin, context.userId);
    const { error } = await supabaseAdmin.auth.admin.signOut(data.userId, 'global');
    if (error) throw new Error(error.message);
    await supabaseAdmin.from('security_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', data.userId).is('revoked_at', null);
    await supabaseAdmin.from('audit_logs').insert({ user_id: context.userId, action: 'sessions_revoked', entity_type: 'user', entity_id: data.userId, description: 'All sessions revoked for user', risk_level: 'critical' });
    return { ok: true };
  });

export const createPrivilegedRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(requestSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { assertSuperAdmin } = await import('@/lib/superAdmin.server');
    await assertSuperAdmin(supabaseAdmin, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc('create_privileged_action_request', {
      _action_key: data.actionKey,
      _target_type: data.targetType,
      _target_id: data.targetId ?? null,
      _reason: data.reason,
      _risk_level: data.riskLevel,
      _metadata: { source: 'super-admin-security-center' },
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const decidePrivilegedRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ requestId: z.string().uuid(), decision: z.enum(['approved','rejected']), reason: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { assertSuperAdmin } = await import('@/lib/superAdmin.server');
    await assertSuperAdmin(supabaseAdmin, context.userId);
    const { data: result, error } = await supabaseAdmin.rpc('decide_privileged_action_request', {
      _request_id: data.requestId, _decision: data.decision, _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return result;
  });
