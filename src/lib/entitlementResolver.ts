// Server-side entitlement resolution
// This is the canonical, authoritative source of truth for access checks
// Used by both frontend (via API) and potentially backend functions

import { supabase } from "@/integrations/supabase/client";
import type {
  ModuleFeature,
  PlanModule,
  SubscriptionPlan,
  TenantSubscription,
  EntitlementContext,
  ModuleEntitlement,
  FeatureAccess,
} from "@/types/entitlement";

/**
 * Resolves the modules entitled to a plan
 * This is the core entitlement function - what modules does this plan include?
 */
export async function getPlanModules(
  planId: string | null | undefined,
): Promise<{ modules: string[]; features: PlanModule[] }> {
  if (!planId) {
    return { modules: [], features: [] };
  }

  const { data, error } = await supabase
    .from("package_features")
    .select("*")
    .eq("package_id", planId)
    .eq("enabled", true);

  if (error) throw error;

  const features = (data || []) as PlanModule[];
  if (!features.length) {
    return { modules: [], features };
  }

  const featureKeys = [...new Set(features.map((f) => f.feature_key).filter(Boolean))];

  const { data: moduleRows, error: moduleError } = await supabase
    .from("module_features")
    .select("module_key, feature_key")
    .in("feature_key", featureKeys);

  if (moduleError) throw moduleError;

  const moduleSet = new Set<string>();
  for (const row of moduleRows || []) {
    if (row.module_key) moduleSet.add(row.module_key);
  }

  for (const featureKey of featureKeys) {
    if (!featureKey) continue;

    const directModule = featureKey.split(".")[0]?.toLowerCase();
    if (directModule) {
      moduleSet.add(directModule);
    }

    const normalized = featureKey.toLowerCase();
    if (normalized === "accounting" || normalized === "banking" || normalized === "manual_journals") {
      moduleSet.add(normalized);
    }
  }

  return {
    modules: [...moduleSet],
    features,
  };
}

/**
 * Resolves the features belonging to a module
 * Used by tenant admins to assign permissions
 */
export async function getModuleFeatures(moduleKey: string): Promise<ModuleFeature[]> {
  const { data, error } = await supabase
    .from("module_features")
    .select("*")
    .eq("module_key", moduleKey)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data || []) as ModuleFeature[];
}

/**
 * Checks if a tenant is entitled to a specific module
 * Returns the entitlement result with reason if denied
 */
export async function checkModuleEntitlement(
  planId: string | undefined,
  moduleKey: string,
): Promise<ModuleEntitlement> {
  if (!planId) {
    return {
      module_key: moduleKey,
      module_label: moduleKey,
      entitled: false,
      reason: "no_plan",
    };
  }

  try {
    const { modules, features } = await getPlanModules(planId);
    const entitled = modules.includes(moduleKey);
    const moduleFeatures = await getModuleFeatures(moduleKey);

    return {
      module_key: moduleKey,
      module_label: moduleKey, // TODO: Get from module registry
      entitled,
      reason: entitled ? undefined : "not_in_plan",
      features: moduleFeatures,
    };
  } catch (error) {
    return {
      module_key: moduleKey,
      module_label: moduleKey,
      entitled: false,
      reason: "error_checking_entitlement",
    };
  }
}

/**
 * Checks if a user can access a specific feature
 * Requires both: module entitled AND user has permission
 */
export async function checkFeatureAccess(
  planId: string | undefined,
  moduleKey: string,
  featureKey: string,
  userPermissions: Set<string>,
): Promise<FeatureAccess> {
  // Check module entitlement first
  const entitlement = await checkModuleEntitlement(planId, moduleKey);

  // Get feature details
  const { data: feature } = await supabase.from("module_features").select("*").eq("feature_key", featureKey).single();

  const permissionKey = (feature as ModuleFeature)?.permission_key || featureKey;

  return {
    feature_key: featureKey,
    feature_label: (feature as ModuleFeature)?.feature_label || featureKey,
    allowed: entitlement.entitled && userPermissions.has(permissionKey),
    reason: !entitlement.entitled
      ? "module_not_entitled"
      : !userPermissions.has(permissionKey)
        ? "permission_denied"
        : undefined,
    module_entitled: entitlement.entitled,
    user_permission: userPermissions.has(permissionKey),
  };
}

/**
 * Superadmin function: Safely update plan modules
 * Uses the secure RPC function under the hood
 */
export async function updatePlanModules(
  planId: string,
  moduleKeys: string[],
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc("set_plan_modules", {
    _package_id: planId,
    _module_keys: moduleKeys,
  });

  if (error) {
    console.error("Error updating plan modules:", error);
    throw new Error(error.message);
  }

  // data is of type { success: boolean, message: string }
  return data as { success: boolean; message: string };
}

/**
 * Superadmin function: Safely create a plan
 * Uses the secure RPC function under the hood
 */
export async function createSubscriptionPlan(input: {
  name: string;
  description?: string;
  monthly_price_kes: number;
  yearly_price_kes: number;
  max_products: number;
  max_users: number;
  max_locations: number;
  max_customers?: number;
  max_suppliers?: number;
  trial_days: number;
}): Promise<{ success: boolean; message: string; package_id?: string }> {
  const { data, error } = await supabase.rpc("create_subscription_plan", {
    _name: input.name,
    _description: input.description || null,
    _monthly_price_kes: input.monthly_price_kes,
    _yearly_price_kes: input.yearly_price_kes,
    _max_products: input.max_products,
    _max_users: input.max_users,
    _max_locations: input.max_locations,
    _max_customers: input.max_customers || 50,
    _max_suppliers: input.max_suppliers || 10,
    _trial_days: input.trial_days,
  });

  if (error) {
    console.error("Error creating plan:", error);
    throw new Error(error.message);
  }

  return data as { success: boolean; message: string; package_id?: string };
}

/**
 * Superadmin function: Safely update plan metadata
 * Uses the secure RPC function under the hood
 */
export async function updateSubscriptionPlan(
  planId: string,
  input: {
    name: string;
    description?: string;
    monthly_price_kes: number;
    yearly_price_kes: number;
    max_products: number;
    max_users: number;
    max_locations: number;
    max_customers?: number;
    max_suppliers?: number;
    trial_days: number;
    is_active: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc("update_subscription_plan", {
    _package_id: planId,
    _name: input.name,
    _description: input.description || null,
    _monthly_price_kes: input.monthly_price_kes,
    _yearly_price_kes: input.yearly_price_kes,
    _max_products: input.max_products,
    _max_users: input.max_users,
    _max_locations: input.max_locations,
    _max_customers: input.max_customers || 50,
    _max_suppliers: input.max_suppliers || 10,
    _trial_days: input.trial_days,
    _is_active: input.is_active,
  });

  if (error) {
    console.error("Error updating plan:", error);
    throw new Error(error.message);
  }

  return data as { success: boolean; message: string };
}
