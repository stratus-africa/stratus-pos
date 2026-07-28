import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { DigitaxSubmitResult, DigitaxTestConnectionResult } from './digitax.server';

const digitaxSubmitSchema = z.object({
  sale_id: z.string(),
  invoice_type: z.enum(['invoice', 'credit_note']).optional(),
  original_sale_id: z.string().optional(),
  wait: z.boolean().optional(),
});

export const digitaxSubmit = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(digitaxSubmitSchema)
  .handler(async ({ data, context }): Promise<DigitaxSubmitResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { submitToDigitax } = await import('./digitax.server');
    return submitToDigitax(supabaseAdmin, context.userId, data);
  });

const digitaxTestConnectionSchema = z.object({
  provider: z.string().optional(),
});

export const digitaxTestConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(digitaxTestConnectionSchema)
  .handler(async ({ data }): Promise<DigitaxTestConnectionResult> => {
    const { testDigitaxConnection } = await import('./digitax.server');
    return testDigitaxConnection(data);
  });
