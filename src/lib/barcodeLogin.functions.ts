import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import type { BarcodeLoginResult } from './barcodeLogin.server';

const barcodeLoginSchema = z.object({
  barcode: z.string(),
  pin: z.string(),
});

// Intentionally UNauthenticated: authenticates the caller via barcode + PIN,
// protected by rate limiting / lockout RPCs inside barcodeLogin.server.ts.
export const barcodeLogin = createServerFn({ method: 'POST' })
  .inputValidator(barcodeLoginSchema)
  .handler(async ({ data }): Promise<BarcodeLoginResult> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { performBarcodeLogin } = await import('./barcodeLogin.server');

    const request = getRequest();
    const ip =
      request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request?.headers.get('x-real-ip') ||
      'unknown';

    return performBarcodeLogin(supabaseAdmin, ip, data);
  });
