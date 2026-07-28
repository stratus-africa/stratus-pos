// Server-only helpers for M-Pesa Daraja credential management via Supabase Vault.
// Never import from client code.

export function vaultNames(businessId: string) {
  const safe = businessId.replace(/-/g, '');
  return {
    consumer_key: `mpesa_${safe}_consumer_key`,
    consumer_secret: `mpesa_${safe}_consumer_secret`,
    passkey: `mpesa_${safe}_passkey`,
  };
}

export async function ensureAdminAccess(supabaseAdmin: any, userId: string, businessId: string): Promise<void> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('business_id')
    .eq('id', userId)
    .maybeSingle();

  const { data: isSA } = await supabaseAdmin.rpc('is_super_admin', { _user_id: userId });

  if (profile?.business_id !== businessId && !isSA) {
    throw new Error('Forbidden');
  }

  if (!isSA) {
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('business_id', businessId);
    const isAdmin = (roles || []).some((r: any) => r.role === 'admin');
    if (!isAdmin) throw new Error('Admin role required');
  }
}

export async function vaultUpsert(supabaseAdmin: any, name: string, secret: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('upsert_vault_secret', { _name: name, _secret: secret });
  if (error) throw error;
}

export async function vaultDelete(supabaseAdmin: any, name: string): Promise<void> {
  await supabaseAdmin.schema('vault').from('secrets').delete().eq('name', name);
}
