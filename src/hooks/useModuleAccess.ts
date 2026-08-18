import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { APP_MODULES, resolveModuleAccess, type ModuleAccessInput } from "@/lib/modules";

export function useModuleAccess() {
  const { userRole } = useBusiness();
  const { permissions, hasPermission } = usePermissions();
  const { hasFeatureKey, enabledFeatureKeys } = useSubscription();

  const accessCache = new Map<string, ReturnType<typeof resolveModuleAccess>>();
  const resolveAccess = (moduleKey: string): ReturnType<typeof resolveModuleAccess> => {
    const cached = accessCache.get(moduleKey);
    if (cached) return cached;

    const input: ModuleAccessInput = {
      role: userRole,
      permissions,
      featureKey: hasFeatureKey,
      subscriptions: enabledFeatureKeys,
      moduleEnabled: () => true,
      dependenciesReady: (dependencyKey) => {
        const dependencyModule = APP_MODULES.find(
          (module) => module.key === dependencyKey || (module.aliases ?? []).includes(dependencyKey),
        );
        if (!dependencyModule) return true;
        return resolveAccess(dependencyModule.key).allowed;
      },
      setupComplete: (requirementKey) => {
        const requirementModule = APP_MODULES.find(
          (module) => module.key === requirementKey || (module.aliases ?? []).includes(requirementKey),
        );
        if (!requirementModule) return true;
        return resolveAccess(requirementModule.key).allowed;
      },
    };

    const access = resolveModuleAccess(moduleKey, input);
    accessCache.set(moduleKey, access);
    return access;
  };

  const accessFor = (moduleKey: string, sectionKey?: string, permissionOverride?: string) => {
    const access = resolveAccess(moduleKey);
    const sectionVisible =
      !sectionKey || access.module?.navigation.some((item) => item.key === sectionKey || item.route === sectionKey);
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
      const access = resolveAccess(moduleKey);
      return access.state !== "locked" && access.state !== "disabled" && access.state !== "coming_soon";
    },
    isModuleSetupComplete: (moduleKey: string) => {
      const access = resolveAccess(moduleKey);
      return access.state !== "setup_required";
    },
  };
}
