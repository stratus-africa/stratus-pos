import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { resolveModuleAccess, type ModuleAccessInput } from "@/lib/modules";

export function useModuleAccess() {
  const { userRole } = useBusiness();
  const { permissions, hasPermission } = usePermissions();
  const { hasFeatureKey } = useSubscription();

  const accessFor = (moduleKey: string, sectionKey?: string, permissionOverride?: string) => {
    const input: ModuleAccessInput = {
      role: userRole,
      permissions,
      featureKey: hasFeatureKey,
      moduleEnabled: () => true,
      dependenciesReady: () => true,
      setupComplete: () => true,
      subscriptions: new Set(),
    };

    const access = resolveModuleAccess(moduleKey, input);
    const sectionVisible = !sectionKey || access.module?.navigation.some((item) => item.key === sectionKey || item.route === sectionKey);
    const hasRequiredPermission = !permissionOverride || hasPermission(permissionOverride);
    return {
      ...access,
      sectionVisible: !!sectionVisible,
      hasRequiredPermission,
      allowed: access.allowed && sectionVisible && hasRequiredPermission,
    };
  };

  return {
    canAccessModule: (moduleKey: string) => accessFor(moduleKey).allowed,
    canViewModule: (moduleKey: string) => accessFor(moduleKey).allowed,
    canAccessSection: (moduleKey: string, sectionKey: string) => accessFor(moduleKey, sectionKey).allowed,
    hasPermission,
    hasModuleSubscription: (moduleKey: string) => {
      const access = resolveModuleAccess(moduleKey, {
        role: userRole,
        permissions,
        featureKey: hasFeatureKey,
        moduleEnabled: () => true,
        dependenciesReady: () => true,
        setupComplete: () => true,
        subscriptions: new Set(),
      });
      return access.state !== "locked" && access.state !== "disabled" && access.state !== "coming_soon";
    },
    isModuleSetupComplete: (moduleKey: string) => {
      const access = resolveModuleAccess(moduleKey, {
        role: userRole,
        permissions,
        featureKey: hasFeatureKey,
        moduleEnabled: () => true,
        dependenciesReady: () => true,
        setupComplete: () => true,
        subscriptions: new Set(),
      });
      return access.state !== "setup_required";
    },
  };
}
