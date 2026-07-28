import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { ensureAdminAccess, vaultDelete, vaultNames, vaultUpsert } from './mpesaCredentials.server';

export const checkMpesaCredentials = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ business_id: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const { data: row } = await supabaseAdmin
      .from('business_payment_credentials')
      .select('has_credentials, updated_at')
      .eq('business_id', data.business_id)
      .eq('provider', 'mpesa')
      .maybeSingle();

    return {
      has_credentials: !!row?.has_credentials,
      updated_at: row?.updated_at ?? null,
    };
  });

export const setMpesaCredentials = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      business_id: z.string(),
      consumer_key: z.string().min(1),
      consumer_secret: z.string().min(1),
      passkey: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const names = vaultNames(data.business_id);

    try {
      await vaultUpsert(supabaseAdmin, names.consumer_key, data.consumer_key);
      await vaultUpsert(supabaseAdmin, names.consumer_secret, data.consumer_secret);
      await vaultUpsert(supabaseAdmin, names.passkey, data.passkey);
    } catch (e) {
      console.error('Vault write failed', e);
      throw new Error('Vault not available. Please contact support to enable secret storage.');
    }

    await supabaseAdmin
      .from('business_payment_credentials')
      .upsert(
        {
          business_id: data.business_id,
          provider: 'mpesa',
          has_credentials: true,
          vault_secret_names: names,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,provider' },
      );

    return { ok: true };
  });

export const deleteMpesaCredentials = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ business_id: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const names = vaultNames(data.business_id);
    await vaultDelete(supabaseAdmin, names.consumer_key);
    await vaultDelete(supabaseAdmin, names.consumer_secret);
    await vaultDelete(supabaseAdmin, names.passkey);

    await supabaseAdmin
      .from('business_payment_credentials')
      .update({ has_credentials: false, updated_at: new Date().toISOString() })
      .eq('business_id', data.business_id)
      .eq('provider', 'mpesa');

    return { ok: true };
  });

export const testMpesaCredentials = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      business_id: z.string(),
      environment: z.enum(['sandbox', 'live']).optional(),
      consumer_key: z.string().optional(),
      consumer_secret: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);

    const names = vaultNames(data.business_id);

    let ck = data.consumer_key?.trim();
    let cs = data.consumer_secret?.trim();
    if (!ck || !cs) {
      const { data: ckData } = await supabaseAdmin.rpc('read_vault_secret', { _name: names.consumer_key });
      const { data: csData } = await supabaseAdmin.rpc('read_vault_secret', { _name: names.consumer_secret });
      ck = ck || (ckData as string | null) || '';
      cs = cs || (csData as string | null) || '';
    }
    if (!ck || !cs) {
      return { ok: false, error: 'No credentials to test. Enter or save them first.' };
    }

    const environment = data.environment === 'live' ? 'live' : 'sandbox';
    const host = environment === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const basic = Buffer.from(`${ck}:${cs}`).toString('base64');
    const started = Date.now();
    const resp = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
    });
    const took = Date.now() - started;
    const text = await resp.text();
    if (!resp.ok) {
      let msg = text;
      try {
        msg = JSON.parse(text)?.errorMessage || msg;
      } catch {
        // keep raw text
      }
      return { ok: false, environment, status: resp.status, error: msg, took_ms: took };
    }
    let expiresIn: string | undefined;
    try {
      expiresIn = JSON.parse(text)?.expires_in;
    } catch {
      // ignore
    }
    return { ok: true, environment, status: resp.status, expires_in: expiresIn, took_ms: took };
  });
