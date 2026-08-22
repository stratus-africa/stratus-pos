import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useEntitlement } from "@/hooks/useEntitlement";
import { APP_MODULES, findModule } from "@/lib/modules";

/**
 * Canonical module access facade.
 *
 * Plan/module entitlement comes exclusively from useEntitlement(). Role
 * permissions remain a separate concern. This hook exists for legacy UI
 * consumers but contains no independent subscription/feature-gate logic.
 */
export function useModuleAccess() {
  const { userRole } = useBusiness();
  const { hasPermission } = usePermissions();
  const { hasModule, hasFeatureKey, isLoading, resolutionStatus } = useEntitlement();

  const accessFor = (moduleKey: string, sectionKey?: string, permissionOverride?: string) => {
    const module = findModule(moduleKey);
    if (!module) {
      return {
        allowed: false,
        sectionVisible: false,
        hasRequiredPermission: false,
        module: null,
        state: "disabled" as const,
        reason: "module_not_found",
      };
    }

    const roleAllowed = !module.roles?.length || (!!userRole && module.roles.includes(userRole as any));
    const sectionVisible =
      !sectionKey || module.navigation.some((item) => item.key === sectionKey || item.route === sectionKey);
    const hasRequiredPermission = !permissionOverride || hasPermission(permissionOverride);
    const modulePermission = module.permissions.length === 0 || module.permissions.some((p) => hasPermission(p));
    const allowed =
      !isLoading &&
      resolutionStatus !== "db_error" &&
      hasModule(module.key) &&
      roleAllowed &&
      !!sectionVisible &&
      hasRequiredPermission &&
      modulePermission;

    return {
      allowed,
      sectionVisible: !!sectionVisible,
      hasRequiredPermission,
      module,
      state: allowed ? ("enabled" as const) : ("locked" as const),
      reason: allowed ? "ok" : !hasModule(module.key) ? "subscription_required" : "permission_missing",
    };
  };

  return {
    canAccessModule: (moduleKey: string) => accessFor(moduleKey).allowed,
    canViewModule: (moduleKey: string) => accessFor(moduleKey).allowed,
    canAccessSection: (moduleKey: string, sectionKey: string) => accessFor(moduleKey, sectionKey).allowed,
    hasPermission,
    hasModuleSubscription: (moduleKey: string) => hasModule(moduleKey),
    isModuleSetupComplete: (_moduleKey: string) => true,
    hasFeatureKey,
    isLoading,
  };
}
