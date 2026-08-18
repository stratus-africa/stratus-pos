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

  const { data: activeSubscription } = useQuery({
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

  const resolvedPlanId = business?.selected_package_id || activeSubscription?.product_id || null;

  if (
    typeof window !== "undefined" &&
    (window as any).__DEBUG_ENTITLEMENT &&
    business?.selected_package_id &&
    activeSubscription?.product_id &&
    business.selected_package_id !== activeSubscription.product_id
  ) {
    console.debug("[useEntitlement] package mismatch between business and subscription", {
      businessId: business.id,
      selectedPackageId: business.selected_package_id,
      subscriptionProductId: activeSubscription.product_id,
      ownerId: business.owner_id,
    });
  }

  const { data: resolvedPackage, isLoading: isLoadingPackage } = useQuery({
    queryKey: ["entitlement:resolved_package", resolvedPlanId],
    queryFn: async () => {
      if (!resolvedPlanId) return null;
      const { data, error } = await supabase
        .from("subscription_packages")
        .select("*")
        .eq("id", resolvedPlanId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!resolvedPlanId,
    staleTime: 30_000,
  });

  // Get the current plan. We must resolve from the active subscription when
  // selected_package_id is not set yet, or when a tenant has an owner-linked plan.
  const { data: planModules, isLoading: isLoadingPlan } = useQuery({
    queryKey: ["entitlement:plan_modules", resolvedPlanId],
    queryFn: async () => {
      if (!resolvedPlanId) return null;
      return getPlanModules(resolvedPlanId);
    },
    enabled: enabled && !!resolvedPlanId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

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
      resolvedPlanId,
      resolvedPackageName: resolvedPackage?.name || null,
      enabledPackageFeatureKeys: planModules?.features?.map((f) => f.feature_key) || [],
      resolvedModuleKeys: planModules?.modules || [],
    });
  }

  // Check entitlement for a specific module
  const checkModuleAccess = async (moduleKey: string) => {
    return checkModuleEntitlement(business?.selected_package_id, moduleKey);
  };

  // Check feature access (requires both entitlement + permission)
  const checkFeatureAccess_Fn = async (moduleKey: string, featureKey: string) => {
    return checkFeatureAccess(business?.selected_package_id, moduleKey, featureKey, permissions);
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
  const getAccessibleModuleFeatures = async (moduleKey: string): Promise<ModuleFeature[]> => {
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
    isLoading: isLoadingPlan || isLoadingPackage,
    isReady: !isLoadingPlan && !isLoadingPackage && !!planModules,

    // Context
    hasPlan:
      !!resolvedPlanId &&
      !!activeSubscription &&
      ["active", "trialing"].includes((activeSubscription.status || "").toLowerCase()) &&
      (!activeSubscription.current_period_end || new Date(activeSubscription.current_period_end) >= new Date()),
    activeSubscription,
    resolvedPlanId,
    resolvedPackageName: resolvedPackage?.name || null,
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
