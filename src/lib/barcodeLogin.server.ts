// Server-only helper logic for the (unauthenticated) barcode login flow.
// Never import this from client-bundled code except the sibling .functions.ts file.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BarcodeLoginInput {
  barcode?: string;
  pin?: string;
}

export interface BarcodeLoginResult {
  email: string;
  token_hash: string;
}

export async function performBarcodeLogin(
  admin: SupabaseClient,
  ip: string,
  body: BarcodeLoginInput,
): Promise<BarcodeLoginResult> {
  const barcode = typeof body?.barcode === 'string' ? body.barcode.trim() : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

  if (!barcode || barcode.length < 4 || barcode.length > 128) {
    throw new Error('Invalid barcode');
  }
  if (!/^[0-9]{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4–8 digits');
  }

  // Rate limit / lockout check
  const { data: locked } = await admin.rpc('is_barcode_locked', {
    _barcode: barcode,
    _ip: ip,
  });
  if (locked === true) {
    throw new Error('Too many failed attempts. Please try again in 15 minutes.');
  }

  const { data: email, error: rpcErr } = await admin.rpc('verify_barcode_pin', {
    _barcode: barcode,
    _pin: pin,
  });
  if (rpcErr) {
    await admin.rpc('record_barcode_attempt', { _barcode: barcode, _ip: ip, _success: false });
    throw new Error('Verification failed');
  }
  if (!email) {
    await admin.rpc('record_barcode_attempt', { _barcode: barcode, _ip: ip, _success: false });
    throw new Error('Invalid barcode or PIN');
  }

  // Generate a magic link and return its hashed token; client calls verifyOtp to establish a session.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email as string,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    await admin.rpc('record_barcode_attempt', { _barcode: barcode, _ip: ip, _success: false });
    throw new Error('Could not issue session');
  }

  await admin.rpc('record_barcode_attempt', { _barcode: barcode, _ip: ip, _success: true });
  return { email: email as string, token_hash: link.properties.hashed_token as string };
}
