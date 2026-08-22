import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const backupSchema = z.object({ backupType: z.enum(['logical','snapshot','incremental','manual']).default('manual') });
const archiveSchema = z.object({ businessId: z.string().uuid(), reason: z.string().min(3), archiveType: z.enum(['logical','export','full']).default('logical') });
const jobSchema = z.object({ jobKey: z.string().min(1) });
const drSchema = z.object({ planId: z.string().uuid(), eventType: z.enum(['drill','incident','restore_test','failover_test']), description: z.string().min(3) });

async function admin(context: any) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { assertSuperAdmin } = await import('@/lib/superAdmin.server');
  await assertSuperAdmin(supabaseAdmin, context.userId);
  return supabaseAdmin;
}

export const queueEnterpriseBackup = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(backupSchema).handler(async ({ data, context }) => {
  const db = await admin(context);
  const { data: result, error } = await db.rpc('queue_platform_backup', { _backup_type: data.backupType });
  if (error) throw new Error(error.message);
  return result;
});

export const requestTenantArchive = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(archiveSchema).handler(async ({ data, context }) => {
  const db = await admin(context);
  const { data: result, error } = await db.rpc('request_tenant_archive', { _business_id: data.businessId, _reason: data.reason, _archive_type: data.archiveType });
  if (error) throw new Error(error.message);
  return result;
});

export const queueSystemJob = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(jobSchema).handler(async ({ data, context }) => {
  const db = await admin(context);
  const { data: result, error } = await db.rpc('queue_system_job', { _job_key: data.jobKey });
  if (error) throw new Error(error.message);
  return result;
});

export const recordDrEvent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(drSchema).handler(async ({ data, context }) => {
  const db = await admin(context);
  const { data: result, error } = await db.rpc('record_dr_event', { _plan_id: data.planId, _event_type: data.eventType, _description: data.description });
  if (error) throw new Error(error.message);
  return result;
});

export const exportTenantControlPlane = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ businessId: z.string().uuid() })).handler(async ({ data, context }) => {
  const db = await admin(context);
  const { data: business, error } = await db.from('businesses').select('*').eq('id', data.businessId).maybeSingle();
  if (error || !business) throw new Error(error?.message || 'Tenant not found');
  const [subs, payments, packages] = await Promise.all([
    db.from('subscriptions').select('*').eq('business_id', data.businessId),
    db.from('offline_payment_requests').select('*').eq('business_id', data.businessId).order('created_at', { ascending: false }).limit(500),
    db.from('subscription_packages').select('id,name,monthly_price_kes,yearly_price_kes'),
  ]);
  return { exportedAt: new Date().toISOString(), exportVersion: '4.0', business, subscriptions: subs.data || [], payments: payments.data || [], packages: packages.data || [] };
});
