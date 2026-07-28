import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { paystackFetch } from './paystack.server';

export interface PaystackInitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export const paystackInitialize = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      packageId: z.string(),
      interval: z.enum(['monthly', 'yearly']),
      callbackUrl: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<PaystackInitializeResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const userId = context.userId;
    const email = (context.claims as any)?.email || '';

    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from('subscription_packages')
      .select('*')
      .eq('id', data.packageId)
      .maybeSingle();

    if (pkgErr || !pkg) {
      throw new Error('Package not found');
    }

    const amountKes =
      data.interval === 'monthly' ? Number(pkg.monthly_price_kes) : Number(pkg.yearly_price_kes);

    if (!amountKes || amountKes <= 0) {
      throw new Error('This plan has no KES price configured. Ask the platform admin to set it.');
    }

    let planCode =
      data.interval === 'monthly' ? pkg.paystack_plan_code_monthly : pkg.paystack_plan_code_yearly;

    if (!planCode) {
      const planRes = await paystackFetch<any>('/plan', {
        method: 'POST',
        body: JSON.stringify({
          name: `${pkg.name} (${data.interval})`,
          amount: Math.round(amountKes * 100),
          interval: data.interval === 'monthly' ? 'monthly' : 'annually',
          currency: 'KES',
        }),
      });
      planCode = planRes?.data?.plan_code;
      if (!planCode) throw new Error('Failed to create Paystack plan');
      await supabaseAdmin
        .from('subscription_packages')
        .update(
          data.interval === 'monthly'
            ? { paystack_plan_code_monthly: planCode }
            : { paystack_plan_code_yearly: planCode },
        )
        .eq('id', pkg.id);
    }

    const initRes = await paystackFetch<any>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: Math.round(amountKes * 100),
        currency: 'KES',
        plan: planCode,
        callback_url: data.callbackUrl,
        metadata: {
          user_id: userId,
          package_id: pkg.id,
          interval: data.interval,
        },
      }),
    });

    return {
      authorization_url: initRes.data.authorization_url,
      access_code: initRes.data.access_code,
      reference: initRes.data.reference,
    };
  });

export interface PaystackManageSubscriptionResult {
  ok?: boolean;
  url?: string;
}

export const paystackManageSubscription = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      action: z.string().optional(),
      subscriptionId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<PaystackManageSubscriptionResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const userId = context.userId;
    const { action, subscriptionId } = data;

    let sub: any = null;
    if (subscriptionId) {
      const { data: isAdmin } = await supabaseAdmin.rpc('is_super_admin', { _user_id: userId });
      if (!isAdmin) {
        throw new Error('Forbidden');
      }
      const { data: row } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .maybeSingle();
      sub = row;
    } else {
      const { data: row } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sub = row;
    }

    if (action === 'cancel' && subscriptionId && sub && !sub.paystack_subscription_code) {
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled', cancel_at_period_end: true })
        .eq('id', sub.id);
      return { ok: true };
    }

    if (!sub?.paystack_subscription_code || !sub?.paystack_email_token) {
      throw new Error('No active subscription');
    }

    if (action === 'cancel') {
      await paystackFetch('/subscription/disable', {
        method: 'POST',
        body: JSON.stringify({
          code: sub.paystack_subscription_code,
          token: sub.paystack_email_token,
        }),
      });
      await supabaseAdmin
        .from('subscriptions')
        .update({ cancel_at_period_end: true })
        .eq('id', sub.id);

      return { ok: true };
    }

    const linkRes = await paystackFetch<any>(`/subscription/${sub.paystack_subscription_code}/manage/link`);
    return { url: linkRes?.data?.link };
  });

export interface PaystackTestConnectionResult {
  ok: boolean;
  environment: 'live' | 'test' | 'unknown';
  webhook_url: string;
  secret_key_configured: boolean;
  webhook_secret_configured: boolean;
  api_ok: boolean;
  api_error: string | null;
  merchant: any;
  recent_subscriptions: any[];
}

export const paystackTestConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}).optional())
  .handler(async ({ context }): Promise<PaystackTestConnectionResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const userId = context.userId;
    const { data: isSA } = await supabaseAdmin.rpc('is_super_admin', { _user_id: userId });
    if (!isSA) {
      throw new Error('Forbidden');
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || '';

    const environment: 'live' | 'test' | 'unknown' = secretKey.startsWith('sk_live_')
      ? 'live'
      : secretKey.startsWith('sk_test_')
        ? 'test'
        : 'unknown';
    const webhookUrl = `${process.env.SUPABASE_URL}/functions/v1/paystack-webhook`;

    let apiOk = false;
    let apiError: string | null = null;
    let merchant: any = null;
    try {
      const res = await paystackFetch<any>('/balance');
      apiOk = !!res?.status;
      merchant = res?.data ?? null;
    } catch (e: any) {
      apiError = e?.message || String(e);
    }

    const { data: recentSubs } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, updated_at, current_period_end, paystack_subscription_code')
      .order('updated_at', { ascending: false })
      .limit(5);

    return {
      ok: true,
      environment,
      webhook_url: webhookUrl,
      secret_key_configured: !!secretKey,
      webhook_secret_configured: !!webhookSecret,
      api_ok: apiOk,
      api_error: apiError,
      merchant,
      recent_subscriptions: recentSubs ?? [],
    };
  });
