import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { CONFIGURED_MARKER, cashierDeniedPermissions, defaultRolePermissions, moduleCatalog, type AppRole } from "@/lib/permissions";


/**
 * Loads the granular permission set for the current user's role within the
 * active business. Falls back to the role's default permission set when the
 * business hasn't customized role_permissions for that role yet.
 *
 * Admins always get the full permission set.
 */
export function usePermissions() {
  const { business, userRole, isMasquerading } = useBusiness();
  const role = (userRole as AppRole | null);

  const { data, isLoading } = useQuery({
    queryKey: ["role_permissions", business?.id, role],
    queryFn: async () => {
      if (!business || !role) return [] as string[];
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("permission")
        .eq("business_id", business.id)
        .eq("role", role);
      if (error) throw error;
      return (data ?? []).map((r: { permission: string }) => r.permission) as string[];
    },
    enabled: !!business && !!role,
    staleTime: 60_000,
  });

  // Admin or super-admin masquerade => full access regardless of stored config.
  if (isMasquerading || role === "admin") {
    return {
      isLoading: false,
      permissions: new Set<string>(["*"]),
      hasPermission: (_key: string) => true,
    };
  }

  const stored = data ?? [];
  const defaults = role ? defaultRolePermissions[role] : [];
  // A role saved by the current Roles editor always carries this marker. When it
  // is present the stored set is authoritative: anything the admin unchecked
  // (including whole modules) stays denied.
  const explicitlyConfigured = stored.includes(CONFIGURED_MARKER);
  let effective = stored.length > 0 ? [...stored] : [...defaults];

  // Legacy configs saved before a module shipped (e.g. HR) have no rows for it,
  // so fall back to the role defaults for those modules only.
  if (stored.length > 0 && !explicitlyConfigured) {
    for (const mod of moduleCatalog) {
      const prefix = `${mod.key}.`;
      if (!stored.some((p) => p.startsWith(prefix))) {
        effective.push(...defaults.filter((p) => p.startsWith(prefix)));
      }
    }
  }

  const set = new Set(effective);

  // Hard role-level denial: cashiers never get accounting or stock movement access.
  if (role === "cashier") {
    for (const key of cashierDeniedPermissions) set.delete(key);
  }


  return {
    isLoading,
    permissions: set,
    hasPermission: (key: string) => set.has(key),
  };
}
