// Unified entitlement resolver hook
// Replaces the pattern of useSubscription + useModuleAccess with a single, clean API
// This is the authoritative hook for checking access

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "./usePermissions";
import { supabase } from "@/integrations/supabase/client";
import {
  checkModuleEntitlement,
  checkFeatureAccess,
  getPlanModules,
  getModuleFeatures,
  resolveBusinessEntitlement,
} from "@/lib/entitlementResolver";
import type { ModuleEntitlement, FeatureAccess, ModuleFeature } from "@/types/entitlement";

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

  const { data: activeSubscription, isLoading: isLoadingSubscription } = useQuery({
    queryKey: ["entitlement:active_subscription", user?.id, business?.id],
    queryFn: async () => {
      if (!enabled || !user) return null;

      const { data, error } = await supabase.rpc("get_current_business_subscription");
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<any>;
      if (rows.length === 0) return null;

      return (
        rows.find((row: any) => ["active", "trialing"].includes((row.status || "").toLowerCase())) || rows[0] || null
      );
    },
    enabled: enabled && !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const packageId = business?.selected_package_id || activeSubscription?.product_id || null;
  const resolvedPackageId = packageId;

  const { data: resolvedPackage, isLoading: isLoadingPackage } = useQuery({
    queryKey: ["entitlement:resolved_package", resolvedPackageId],
    queryFn: async () => {
      if (!resolvedPackageId) return null;
      const { data, error } = await supabase.rpc("get_subscription_package_safe", {
        _id: resolvedPackageId,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows[0] ?? null;
    },
    enabled: enabled && !!resolvedPackageId,
    staleTime: 30_000,
  });

  const { data: planModules, isLoading: isLoadingPlan } = useQuery({
    queryKey: ["entitlement:plan_modules", resolvedPackageId],
    queryFn: async () => {
      if (!resolvedPackageId) return null;
      return getPlanModules(resolvedPackageId);
    },
    enabled: enabled && !!resolvedPackageId,
    staleTime: 5 * 60 * 1000,
  });

  const canonicalEntitlement = useQuery({
    queryKey: ["entitlement:canonical", business?.id, business?.selected_package_id, activeSubscription?.product_id],
    queryFn: async () => resolveBusinessEntitlement({ business, activeSubscription }),
    enabled: enabled && !!business?.id,
    staleTime: 30_000,
  });

  const entitlement = canonicalEntitlement.data ?? {
    hasPlan:
      !!resolvedPackageId &&
      ((!!activeSubscription && ["active", "trialing"].includes((activeSubscription?.status || "").toLowerCase())) ||
        !!resolvedPackage ||
        !!business?.selected_package_id),
    subscription: activeSubscription,
    package: resolvedPackage,
    packageId: resolvedPackageId,
    packageName: resolvedPackage?.name || null,
    packageFeatures: planModules?.features || [],
    enabledModules: planModules?.modules || [],
    resolutionStatus: resolvedPackageId
      ? planModules?.modules?.length
        ? "modules_resolved"
        : "no_enabled_features"
      : "no_plan",
  };

  if (typeof window !== "undefined" && (window as any).__DEBUG_ENTITLEMENT) {
    console.debug("[useEntitlement]", {
      authUserId: user?.id,
      businessId: business?.id,
      businessOwnerId: business?.owner_id,
      businessSelectedPackageId: business?.selected_package_id,
      subscriptionId: activeSubscription?.id,
      subscriptionStatus: activeSubscription?.status,
      subscriptionProductId: activeSubscription?.product_id,
      paymentProvider: activeSubscription?.payment_provider,
      subscriptionPeriodEnd: activeSubscription?.current_period_end,
      packageId: entitlement.packageId,
      packageName: entitlement.packageName,
      packageFeatureCount: entitlement.packageFeatures?.length ?? 0,
      enabledFeatureKeys: entitlement.packageFeatures?.map((f: any) => f.feature_key) ?? [],
      resolvedModuleKeys: entitlement.enabledModules ?? [],
      resolutionStatus: entitlement.resolutionStatus,
    });
  }

  const checkModuleAccess = async (moduleKey: string) => {
    return checkModuleEntitlement(entitlement.packageId || business?.selected_package_id, moduleKey);
  };

  const checkFeatureAccess_Fn = async (moduleKey: string, featureKey: string) => {
    return checkFeatureAccess(
      entitlement.packageId || business?.selected_package_id,
      moduleKey,
      featureKey,
      permissions,
    );
  };

  const hasModule = (moduleKey: string): boolean => {
    if (!entitlement.enabledModules || entitlement.enabledModules.length === 0) return false;
    const normalized = moduleKey.toLowerCase();
    return entitlement.enabledModules.some(
      (key: string) => key.toLowerCase() === normalized || key.toLowerCase().startsWith(`${normalized}.`),
    );
  };

  const hasFeature = (moduleKey: string, featureKey: string): boolean => {
    if (!hasModule(moduleKey)) return false;
    return permissions.has(featureKey);
  };

  const getEntitledModules = (): string[] => {
    return entitlement.enabledModules || [];
  };

  const getAccessibleModuleFeatures = async (moduleKey: string): Promise<ModuleFeature[]> => {
    if (!hasModule(moduleKey)) return [];

    const features = await getModuleFeatures(moduleKey);
    return features.filter((f) => permissions.has(f.permission_key));
  };

  return {
    hasModule,
    hasFeature,
    checkModuleAccess,
    checkFeatureAccess: checkFeatureAccess_Fn,
    getEntitledModules,
    getAccessibleModuleFeatures,
    planModules: entitlement.enabledModules || [],
    allPlanFeatures: entitlement.packageFeatures || [],
    isLoading: isLoadingSubscription || isLoadingPackage || isLoadingPlan || canonicalEntitlement.isLoading,
    isReady: !isLoadingSubscription && !isLoadingPackage && !isLoadingPlan && !canonicalEntitlement.isLoading,
    hasPlan: entitlement.hasPlan,
    activeSubscription,
    plan: entitlement.package,
    planId: entitlement.packageId,
    package: entitlement.package,
    packageName: entitlement.packageName,
    resolutionStatus: entitlement.resolutionStatus,
    resolvedPlanId: entitlement.packageId,
    resolvedPackageName: entitlement.packageName,
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
