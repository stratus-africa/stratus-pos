// Unified entitlement resolver hook
// Replaces the pattern of useSubscription + useModuleAccess with a single, clean API
// This is the authoritative hook for checking access

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "./usePermissions";
import {
  checkModuleEntitlement,
  checkFeatureAccess,
  getPlanModules,
  getModuleFeatures,
} from "@/lib/entitlementResolver";
import type {
  ModuleEntitlement,
  FeatureAccess,
  ModuleFeature,
} from "@/types/entitlement";

interface UseEntitlementOptions {
  enabled?: boolean;
}

/**
 * Unified hook for all entitlement checks
 * Replaces fragmented useSubscription + useModuleAccess pattern
 * 
 * Usage:
 * const { hasModule, hasFeature, getModuleEntitlement, isLoading } = useEntitlement();
 * if (hasModule("accounting")) { show accounting }
 */
export function useEntitlement(options: UseEntitlementOptions = {}) {
  const { enabled = true } = options;
  const { user } = useAuth();
  const { business } = useBusiness();
  const { permissions } = usePermissions();

  // Get the current plan
  const { data: planModules, isLoading: isLoadingPlan } = useQuery({
    queryKey: ["entitlement:plan_modules", business?.selected_package_id],
    queryFn: async () => {
      if (!business?.selected_package_id) return null;
      return getPlanModules(business.selected_package_id);
    },
    enabled: enabled && !!business?.selected_package_id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Check entitlement for a specific module
  const checkModuleAccess = async (moduleKey: string) => {
    return checkModuleEntitlement(business?.selected_package_id, moduleKey);
  };

  // Check feature access (requires both entitlement + permission)
  const checkFeatureAccess_Fn = async (
    moduleKey: string,
    featureKey: string
  ) => {
    return checkFeatureAccess(
      business?.selected_package_id,
      moduleKey,
      featureKey,
      permissions
    );
  };

  // Helper: Check if module is entitled
  const hasModule = (moduleKey: string): boolean => {
    if (!planModules) return false;
    return planModules.modules.includes(moduleKey);
  };

  // Helper: Check if feature is accessible
  const hasFeature = (moduleKey: string, featureKey: string): boolean => {
    if (!hasModule(moduleKey)) return false;
    return permissions.has(featureKey);
  };

  // Helper: Get all modules user is entitled to
  const getEntitledModules = (): string[] => {
    return planModules?.modules || [];
  };

  // Helper: Get all features for a module that user can access
  const getAccessibleModuleFeatures = async (
    moduleKey: string
  ): Promise<ModuleFeature[]> => {
    if (!hasModule(moduleKey)) return [];

    const features = await getModuleFeatures(moduleKey);
    return features.filter((f) => permissions.has(f.permission_key));
  };

  return {
    // Core checks
    hasModule,
    hasFeature,
    checkModuleAccess,
    checkFeatureAccess: checkFeatureAccess_Fn,

    // Data accessors
    getEntitledModules,
    getAccessibleModuleFeatures,
    planModules: planModules?.modules || [],
    allPlanFeatures: planModules?.features || [],

    // Loading state
    isLoading: isLoadingPlan,
    isReady: !isLoadingPlan && !!planModules,

    // Context
    hasPlan: !!business?.selected_package_id,
    userRole: business?.owner_id === user?.id ? "owner" : "member",
  };
}

/**
 * Hook for tenant admins to manage module entitlements
 * Used in settings to assign/revoke module access for roles
 */
export function useModuleManagement() {
  const { business } = useBusiness();
  const { permissions } = usePermissions();

  // Get all features that can be assigned to a role
  const { data: availableFeatures, isLoading } = useQuery({
    queryKey: ["module_management:available_features", business?.id],
    queryFn: async () => {
      if (!business?.id) return [];

      // Get list of modules this plan is entitled to
      const planModules = await getPlanModules(business.selected_package_id || "");
      if (!planModules) return [];

      // For each module, get its features
      const allFeatures: ModuleFeature[] = [];
      for (const moduleKey of planModules.modules) {
        const features = await getModuleFeatures(moduleKey);
        allFeatures.push(...features);
      }

      return allFeatures;
    },
    enabled: !!business?.id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    availableFeatures: availableFeatures || [],
    isLoading,
    canAssignFeature: (featureKey: string) => {
      // Only features from entitled modules can be assigned to roles
      return availableFeatures?.some((f) => f.feature_key === featureKey) || false;
    },
  };
}

/**
 * Hook for superadmins to manage subscription plans
 * Used in SuperAdminPackages to create/modify plans
 */
export function usePlanManagement() {
  const { user } = useAuth();
  const isSuperAdmin = user?.user_metadata?.is_super_admin === true;

  if (!isSuperAdmin) {
    console.warn("usePlanManagement: User is not a superadmin");
  }

  return {
    isSuperAdmin,
    canManagePlans: isSuperAdmin,
  };
}
