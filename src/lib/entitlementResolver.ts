// Server-side entitlement resolution
// This is the canonical, authoritative source of truth for access checks
// Used by both frontend (via API) and potentially backend functions

import { supabase } from "@/integrations/supabase/client";
import { findModule, getCanonicalFeatureKey, moduleKeys } from "@/lib/modules";
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

  let features: PlanModule[] = [];

  try {
    const { data, error } = await supabase.rpc("get_package_features_safe", {
      _package_id: planId,
    });

    if (error) throw error;
    features = (data || []) as PlanModule[];
  } catch {
    const { data, error } = await supabase
      .from("package_features")
      .select("*")
      .eq("package_id", planId)
      .eq("enabled", true);

    if (error) throw error;
    features = (data || []) as PlanModule[];
  }

  const moduleSet = new Set<string>();

  for (const feature of features) {
    const rawKey = (feature.feature_key || "").trim();
    if (!rawKey) continue;

    const directModule = findModule(rawKey);
    const canonical = directModule ? directModule.key : getCanonicalFeatureKey(rawKey);
    if (canonical) moduleSet.add(canonical.toLowerCase());

    const candidateKeys = new Set<string>();
    candidateKeys.add(rawKey.toLowerCase());
    candidateKeys.add(getCanonicalFeatureKey(rawKey).toLowerCase());
    if (directModule) candidateKeys.add(directModule.key.toLowerCase());

    for (const key of moduleKeys(rawKey)) {
      candidateKeys.add(key.toLowerCase());
    }

    const directPrefix = rawKey.split(".")[0]?.toLowerCase();
    if (directPrefix) moduleSet.add(directPrefix);

    for (const key of candidateKeys) {
      if (key) moduleSet.add(key);
    }
  }

  const modules = [...moduleSet].filter(Boolean);
  return { modules, features };
}

export type EntitlementResolutionStatus =
  | "loading"
  | "no_business"
  | "no_plan"
  | "subscription_inactive"
  | "package_not_found"
  | "no_enabled_features"
  | "modules_resolved";

export async function resolveBusinessEntitlement(input: {
  business?: { id?: string | null; owner_id?: string | null; selected_package_id?: string | null } | null;
  activeSubscription?: any | null;
}) {
  const business = input.business ?? null;
  const activeSubscription = input.activeSubscription ?? null;

  if (!business?.id) {
    return {
      hasPlan: false,
      subscription: activeSubscription,
      package: null,
      packageId: business?.selected_package_id ?? null,
      packageName: null,
      packageFeatures: [],
      enabledModules: [],
      resolutionStatus: "no_business" as EntitlementResolutionStatus,
    };
  }

  const packageId = business.selected_package_id || activeSubscription?.product_id || null;
  if (!packageId) {
    return {
      hasPlan: false,
      subscription: activeSubscription,
      package: null,
      packageId: null,
      packageName: null,
      packageFeatures: [],
      enabledModules: [],
      resolutionStatus: activeSubscription ? "subscription_inactive" : ("no_plan" as EntitlementResolutionStatus),
    };
  }

  const { data: pkg, error: pkgError } = await supabase
    .from("subscription_packages")
    .select("*")
    .eq("id", packageId)
    .maybeSingle();

  if (pkgError || !pkg) {
    return {
      hasPlan: false,
      subscription: activeSubscription,
      package: null,
      packageId,
      packageName: null,
      packageFeatures: [],
      enabledModules: [],
      resolutionStatus: "package_not_found" as EntitlementResolutionStatus,
    };
  }

  const { data: featureRows, error: featureError } = await supabase
    .from("package_features")
    .select("*")
    .eq("package_id", pkg.id)
    .eq("enabled", true);

  if (featureError) {
    throw featureError;
  }

  const packageFeatures = (featureRows || []) as PlanModule[];
  const enabledModules = Array.from(
    new Set(packageFeatures.map((feature) => getCanonicalFeatureKey(feature.feature_key)).filter(Boolean)),
  );

  const hasActiveSubscription = Boolean(
    activeSubscription && ["active", "trialing"].includes((activeSubscription.status || "").toLowerCase()),
  );
  const hasAssignedPackage = Boolean(business?.selected_package_id || activeSubscription?.product_id);
  const hasPlan = hasActiveSubscription || (hasAssignedPackage && Boolean(pkg));

  return {
    hasPlan,
    subscription: activeSubscription,
    package: pkg,
    packageId: pkg.id,
    packageName: pkg.name,
    packageFeatures,
    enabledModules,
    resolutionStatus:
      enabledModules.length > 0 ? "modules_resolved" : ("no_enabled_features" as EntitlementResolutionStatus),
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
