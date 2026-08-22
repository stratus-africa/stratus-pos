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

    const { data: providerEnabled } = await supabaseAdmin.rpc('is_payment_provider_enabled', { _provider: 'paystack' });
    if (!providerEnabled) {
      throw new Error('Paystack payments are currently disabled. Please contact the administrator.');
    }

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

export interface PaystackVerifyTransactionResult {
  ok: boolean;
  reference: string;
  status: string;
  amount: number;
  currency: string;
}

export const paystackVerifyTransaction = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ reference: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<PaystackVerifyTransactionResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const userId = context.userId;

    const verify = await paystackFetch<any>(`/transaction/verify/${encodeURIComponent(data.reference)}`);
    const tx = verify?.data;
    if (!tx || tx.status !== 'success') {
      throw new Error('Paystack could not verify this payment.');
    }

    const metadata = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata || '{}') : (tx.metadata || {});
    if (metadata.user_id && metadata.user_id !== userId) {
      throw new Error('This payment does not belong to the signed-in account.');
    }

    const packageId = metadata.package_id as string | undefined;
    const interval = metadata.interval as 'monthly' | 'yearly' | undefined;
    const amount = Number(tx.amount || 0);
    const currency = String(tx.currency || '');
    if (!packageId || !interval || currency !== 'KES') {
      throw new Error('The verified Paystack payment is missing valid subscription details.');
    }

    const { data: pkg } = await supabaseAdmin
      .from('subscription_packages')
      .select('id, monthly_price_kes, yearly_price_kes, paystack_plan_code_monthly, paystack_plan_code_yearly')
      .eq('id', packageId)
      .maybeSingle();
    if (!pkg) throw new Error('Subscription package not found.');

    const expected = Math.round(Number(interval === 'monthly' ? pkg.monthly_price_kes : pkg.yearly_price_kes) * 100);
    if (expected <= 0 || amount !== expected) {
      throw new Error('The verified payment amount does not match the selected subscription.');
    }

    const planCode = interval === 'monthly' ? pkg.paystack_plan_code_monthly : pkg.paystack_plan_code_yearly;
    const txPlanCode = tx.plan?.plan_code as string | undefined;
    if (planCode && txPlanCode && planCode !== txPlanCode) {
      throw new Error('The verified payment plan does not match the selected subscription.');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (interval === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    const env = (process.env.PAYSTACK_SECRET_KEY || '').startsWith('sk_test_') ? 'sandbox' : 'live';
    const customerCode = tx.customer?.customer_code ?? null;
    const subscriptionCode = tx.subscription?.subscription_code ?? null;
    const emailToken = tx.subscription?.email_token ?? null;

    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('environment', env)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload: any = {
      user_id: userId,
      environment: env,
      status: 'active',
      paystack_customer_code: customerCode,
      paystack_subscription_code: subscriptionCode,
      paystack_email_token: emailToken,
      plan_code: txPlanCode || planCode || null,
      product_id: packageId,
      price_id: interval,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    };

    if (existing?.id) await supabaseAdmin.from('subscriptions').update(payload).eq('id', existing.id);
    else await supabaseAdmin.from('subscriptions').insert(payload);

    return { ok: true, reference: data.reference, status: tx.status, amount, currency };
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

export interface PaystackTransactionRow {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  gateway_response: string | null;
  paid_at: string | null;
  created_at: string | null;
  customer?: { email?: string | null; first_name?: string | null; last_name?: string | null } | null;
  metadata?: unknown;
}

export interface PaystackListTransactionsResult {
  transactions: PaystackTransactionRow[];
  page: number;
  perPage: number;
  total: number;
  pages: number;
  environment: 'live' | 'test' | 'unknown';
}

export const paystackListTransactions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      page: z.number().int().min(1).max(10000).default(1),
      perPage: z.number().int().min(10).max(100).default(50),
      status: z.enum(['all', 'success', 'failed', 'abandoned']).default('all'),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<PaystackListTransactionsResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: isSA } = await supabaseAdmin.rpc('is_super_admin', { _user_id: context.userId });
    if (!isSA) throw new Error('Forbidden');

    const params = new URLSearchParams({ page: String(data.page), perPage: String(data.perPage) });
    if (data.status !== 'all') params.set('status', data.status);
    if (data.from) params.set('from', data.from);
    if (data.to) params.set('to', data.to);

    const response = await paystackFetch<any>(`/transaction?${params.toString()}`);
    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    const environment: 'live' | 'test' | 'unknown' = secretKey.startsWith('sk_live_')
      ? 'live'
      : secretKey.startsWith('sk_test_')
        ? 'test'
        : 'unknown';
    const meta = response?.meta || {};
    const total = Number(meta.total ?? 0);
    const perPage = Number(meta.perPage ?? data.perPage);

    return {
      transactions: (response?.data || []) as PaystackTransactionRow[],
      page: Number(meta.page ?? data.page),
      perPage,
      total,
      pages: Math.max(1, Math.ceil(total / perPage)),
      environment,
    };
  });
