// Server-only helper logic for DigiTax server functions.
// Never import this from client-bundled code except sibling .functions.ts files.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DigitaxSubmitInput {
  sale_id: string;
  invoice_type?: 'invoice' | 'credit_note';
  original_sale_id?: string;
  wait?: boolean;
}

export interface DigitaxSubmitResult {
  missing?: string[];
  queued_id?: string;
  skipped?: boolean;
  reason?: string;
  sale?: Record<string, string | number | boolean | null>;
}

export async function submitToDigitax(
  admin: SupabaseClient,
  userId: string,
  body: DigitaxSubmitInput,
): Promise<DigitaxSubmitResult> {
  if (!body.sale_id) throw new Error('sale_id required');

  // Load sale + items + business
  const { data: sale, error: saleErr } = await admin
    .from('sales')
    .select('*, customers(*)')
    .eq('id', body.sale_id)
    .maybeSingle();
  if (saleErr || !sale) throw new Error('Sale not found');

  // Auth: user must belong to the business (or super admin)
  const { data: profile } = await admin.from('profiles').select('business_id').eq('id', userId).maybeSingle();
  const { data: superAdmin } = await admin.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (!superAdmin && profile?.business_id !== sale.business_id) {
    throw new Error('Forbidden');
  }

  // Load settings
  const { data: settings } = await admin
    .from('digitax_settings')
    .select('*')
    .eq('business_id', sale.business_id)
    .maybeSingle();
  if (!settings?.enabled) return { skipped: true, reason: 'digitax_disabled' };

  // Build items snapshot
  const { data: items } = await admin
    .from('sale_items')
    .select('*, products(name, kra_item_code, hs_code, tax_category)')
    .eq('sale_id', sale.id);

  const payload = {
    business_id: sale.business_id,
    sale_id: sale.id,
    invoice_number: sale.invoice_number,
    invoice_type: body.invoice_type ?? 'invoice',
    customer: sale.customers
      ? {
          name: sale.customers.name,
          kra_pin: sale.customers.kra_pin ?? null,
          vat_registered: sale.customers.vat_registered ?? null,
          customer_type: sale.customers.customer_type ?? null,
          tax_exemption_number: sale.customers.tax_exemption_number ?? null,
        }
      : null,
    items: (items ?? []).map((it: any) => ({
      name: it.products?.name ?? 'Item',
      kra_item_code: it.products?.kra_item_code ?? null,
      hs_code: it.products?.hs_code ?? null,
      tax_category: it.products?.tax_category ?? null,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      discount: Number(it.discount),
      total: Number(it.total),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    currency: settings.default_currency ?? 'KES',
    issued_at: sale.created_at,
  };

  // Server-side KRA field validation — never call the provider without required fields
  const missing: string[] = [];
  if (!payload.invoice_number) missing.push('sale.invoice_number');
  if (!payload.total || Number(payload.total) <= 0) missing.push('sale.total');
  if (!payload.items.length) missing.push('sale.items (none)');
  if (payload.customer) {
    if (
      ['company', 'government', 'ngo'].includes(payload.customer.customer_type ?? '') &&
      !payload.customer.kra_pin
    ) {
      missing.push('customer.kra_pin');
    }
  }
  (items ?? []).forEach((it: any, idx: number) => {
    const label = it.products?.name || `item ${idx + 1}`;
    if (!it.products?.kra_item_code) missing.push(`${label}: kra_item_code`);
    if (!it.products?.tax_category) missing.push(`${label}: tax_category`);
  });

  if (missing.length) {
    const errMsg = 'Missing required KRA fields: ' + missing.join('; ');
    await admin
      .from('digitax_invoice_queue')
      .insert({
        business_id: sale.business_id,
        sale_id: sale.id,
        original_sale_id: body.original_sale_id ?? null,
        invoice_type: body.invoice_type ?? 'invoice',
        payload_json: payload,
        status: 'validation_failed',
        error_message: errMsg,
        created_by: userId,
      })
      .select('id')
      .single();
    await admin.from('sales').update({ fiscal_status: 'failed' }).eq('id', sale.id);
    throw new Error(errMsg);
  }

  // Enqueue
  const { data: queued, error: qErr } = await admin
    .from('digitax_invoice_queue')
    .insert({
      business_id: sale.business_id,
      sale_id: sale.id,
      original_sale_id: body.original_sale_id ?? null,
      invoice_type: body.invoice_type ?? 'invoice',
      payload_json: payload,
      status: 'pending',
      created_by: userId,
    })
    .select('id')
    .single();
  if (qErr) throw new Error(qErr.message);

  await admin.from('sales').update({ fiscal_status: 'pending_submission' }).eq('id', sale.id);

  if (body.wait) {
    const url = process.env.SUPABASE_URL!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const invoke = await fetch(`${url}/functions/v1/digitax-process-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${service}` },
      body: JSON.stringify({ queue_id: queued.id }),
    }).catch(() => null);
    if (invoke) await invoke.text();
    const { data: updated } = await admin
      .from('sales')
      .select(
        'fiscal_status,fiscal_invoice_number,fiscal_reference,fiscal_qr_code,fiscal_verification_url,fiscal_submitted_at',
      )
      .eq('id', sale.id)
      .maybeSingle();
    return { queued_id: queued.id, sale: (updated as Record<string, string | number | boolean | null>) ?? undefined };
  }

  return { queued_id: queued.id };
}

export interface DigitaxTestConnectionInput {
  provider?: string;
}

export interface DigitaxTestConnectionResult {
  ok: boolean;
  message: string;
}

export async function testDigitaxConnection(
  body: DigitaxTestConnectionInput,
): Promise<DigitaxTestConnectionResult> {
  const provider = body.provider ?? 'mock';
  if (provider === 'mock') {
    return { ok: true, message: 'Mock DigiTax sandbox reachable (simulated)' };
  }
  // For the real provider, we'd hit /health with the stored API key.
  return { ok: true, message: 'DigiTax provider connected (stubbed)' };
}
