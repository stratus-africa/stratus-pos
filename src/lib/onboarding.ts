export function resolveBusinessId(
  profileBusinessId: string | null,
  roleBusinessId: string | null,
  ownerBusinessId?: string | null,
): string | null {
  return profileBusinessId || roleBusinessId || ownerBusinessId || null;
}
