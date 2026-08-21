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
 * Core workspace modules are not subscription-gated. A tenant must always be
 * able to reach its dashboard, business settings, and own profile regardless
 * of which commercial modules are enabled on its plan. Role permissions still
 * control what the user can do once inside those areas.
 */
export const ALWAYS_ENTITLED_CORE_MODULES = ["dashboard", "settings", "profile"] as const;

const isAlwaysEntitledCoreModule = (moduleKey: string) =>
  ALWAYS_ENTITLED_CORE_MODULES.includes(
    moduleKey.trim().toLowerCase() as (typeof ALWAYS_ENTITLED_CORE_MODULES)[number],
  );

/**
 * Returns the globally enabled module keys from the Super Admin module catalog.
 * A premium module is only available to tenants when at least one of its
 * catalog features is active. This is intentionally checked in addition to
 * package_features so disabling a module in Modules Manager immediately removes
 * it from every tenant, even when an older plan still contains that module.
 */
export async function getGloballyEnabledModuleKeys(): Promise<Set<string>> {
  const { data, error } = await supabase.from("module_features").select("module_key").eq("is_active", true);

  if (error) throw error;

  return new Set(
    ((data || []) as Array<{ module_key?: string | null }>)
      .map((row) => row.module_key?.trim().toLowerCase())
      .filter((key): key is string => !!key),
  );
}

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
  const globallyEnabledModules = await getGloballyEnabledModuleKeys();

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
    const canonicalKey = canonical?.toLowerCase();

    // Core modules are always available. Commercial/premium modules must also
    // be globally enabled in Modules Manager before a plan can expose them.
    const moduleKeyForCatalog = canonicalKey || rawKey.split(".")[0]?.toLowerCase();
    const globallyEnabled =
      !!moduleKeyForCatalog &&
      (isAlwaysEntitledCoreModule(moduleKeyForCatalog) || globallyEnabledModules.has(moduleKeyForCatalog));

    if (canonicalKey && globallyEnabled) moduleSet.add(canonicalKey);

    const candidateKeys = new Set<string>();
    candidateKeys.add(rawKey.toLowerCase());
    candidateKeys.add(getCanonicalFeatureKey(rawKey).toLowerCase());
    if (directModule) candidateKeys.add(directModule.key.toLowerCase());

    for (const key of moduleKeys(rawKey)) {
      candidateKeys.add(key.toLowerCase());
    }

    const directPrefix = rawKey.split(".")[0]?.toLowerCase();
    if (directPrefix && (isAlwaysEntitledCoreModule(directPrefix) || globallyEnabledModules.has(directPrefix))) {
      moduleSet.add(directPrefix);
    }

    for (const key of candidateKeys) {
      if (!key) continue;
      const candidateModule = findModule(key)?.key?.toLowerCase() || key.split(".")[0]?.toLowerCase();
      if (
        isAlwaysEntitledCoreModule(candidateModule || "") ||
        (candidateModule ? globallyEnabledModules.has(candidateModule) : false)
      ) {
        moduleSet.add(key);
      }
    }
  }

  // Keep plan configuration authoritative for commercial modules, while core
  // workspace modules remain available to every tenant.
  for (const coreModule of ALWAYS_ENTITLED_CORE_MODULES) {
    moduleSet.add(coreModule);
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
  | "modules_resolved"
  | "db_error";

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
      error: null as string | null,
    };
  }

  // AUTHORITATIVE: businesses.selected_package_id is the ONLY application-level
  // package assignment. subscriptions.product_id is a billing-provider reference
  // and must not be used as the application package ID.
  const packageId = business.selected_package_id ?? null;

  if (!packageId) {
    return {
      hasPlan: false,
      subscription: activeSubscription,
      package: null,
      packageId: null,
      packageName: null,
      packageFeatures: [],
      // Core workspace access does not depend on a commercial package.
      enabledModules: [...ALWAYS_ENTITLED_CORE_MODULES],
      resolutionStatus: "no_plan" as EntitlementResolutionStatus,
      error: null as string | null,
    };
  }

  const { data: pkgRows, error: pkgError } = await supabase.rpc("get_subscription_package_safe", {
    _id: packageId,
  });

  if (pkgError) {
    return {
      hasPlan: false,
      subscription: activeSubscription,
      package: null,
      packageId,
      packageName: null,
      packageFeatures: [],
      enabledModules: [...ALWAYS_ENTITLED_CORE_MODULES],
      resolutionStatus: "db_error" as EntitlementResolutionStatus,
      error: pkgError.message,
    };
  }

  const pkg = Array.isArray(pkgRows) ? (pkgRows[0] ?? null) : (pkgRows ?? null);

  if (!pkg) {
    return {
      hasPlan: false,
      subscription: activeSubscription,
      package: null,
      packageId,
      packageName: null,
      packageFeatures: [],
      enabledModules: [...ALWAYS_ENTITLED_CORE_MODULES],
      resolutionStatus: "package_not_found" as EntitlementResolutionStatus,
      error: null as string | null,
    };
  }

  const [featureResult, globallyEnabledModules] = await Promise.all([
    supabase.from("package_features").select("*").eq("package_id", pkg.id).eq("enabled", true),
    getGloballyEnabledModuleKeys(),
  ]);

  const { data: featureRows, error: featureError } = featureResult;

  if (featureError) {
    return {
      hasPlan: true, // Package exists; features query failed — don't say "no plan"
      subscription: activeSubscription,
      package: pkg,
      packageId: pkg.id,
      packageName: pkg.name,
      packageFeatures: [],
      enabledModules: [],
      resolutionStatus: "db_error" as EntitlementResolutionStatus,
      error: featureError.message,
    };
  }

  const packageFeatures = (featureRows || []) as PlanModule[];

  // Use the same comprehensive resolution as getPlanModules so feature_key variants
  // (e.g. "sales.view", "chart_of_accounts", aliases) all map to canonical module keys.
  const moduleSet = new Set<string>();
  for (const feature of packageFeatures) {
    const rawKey = (feature.feature_key || "").trim();
    if (!rawKey) continue;
    const directModule = findModule(rawKey);
    const canonical = directModule ? directModule.key : getCanonicalFeatureKey(rawKey);
    const canonicalKey = canonical?.toLowerCase();
    const directPrefix = rawKey.split(".")[0]?.toLowerCase();
    const moduleKeyForCatalog = canonicalKey || directPrefix;
    const globallyEnabled =
      !!moduleKeyForCatalog &&
      (isAlwaysEntitledCoreModule(moduleKeyForCatalog) || globallyEnabledModules.has(moduleKeyForCatalog));

    if (canonicalKey && globallyEnabled) moduleSet.add(canonicalKey);
    if (directPrefix && (isAlwaysEntitledCoreModule(directPrefix) || globallyEnabledModules.has(directPrefix))) {
      moduleSet.add(directPrefix);
    }
    for (const key of moduleKeys(rawKey)) {
      if (!key) continue;
      const candidateModule = findModule(key)?.key?.toLowerCase() || key.toLowerCase().split(".")[0];
      if (isAlwaysEntitledCoreModule(candidateModule) || globallyEnabledModules.has(candidateModule)) {
        moduleSet.add(key.toLowerCase());
      }
    }
  }
  // Core workspace modules are always entitled, independent of package_features.
  // This prevents a plan configuration from locking a tenant out of its own
  // dashboard, business settings, or profile. Role permissions remain separate.
  for (const coreModule of ALWAYS_ENTITLED_CORE_MODULES) {
    moduleSet.add(coreModule);
  }
  const enabledModules = [...moduleSet].filter(Boolean);

  return {
    hasPlan: true,
    subscription: activeSubscription,
    package: pkg,
    packageId: pkg.id,
    packageName: pkg.name,
    packageFeatures,
    enabledModules,
    resolutionStatus: (enabledModules.length > 0
      ? "modules_resolved"
      : "no_enabled_features") as EntitlementResolutionStatus,
    error: null as string | null,
  };
}

/**
 * Resolves the features belonging to a module
 * Used by tenant admins to assign permissions
 */
export async function getModuleFeatures(moduleKey: string): Promise<ModuleFeature[]> {
  try {
    const { data, error } = await supabase
      .from("module_features")
      .select("*")
      .eq("module_key", moduleKey)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return (data || []) as ModuleFeature[];
  } catch (error) {
    console.warn(`Failed to load module features for ${moduleKey}:`, error);
    return [];
  }
}

/**
 * Checks if a tenant is entitled to a specific module
 * Returns the entitlement result with reason if denied
 */
export async function checkModuleEntitlement(
  planId: string | undefined,
  moduleKey: string,
): Promise<ModuleEntitlement> {
  if (isAlwaysEntitledCoreModule(moduleKey)) {
    return {
      module_key: moduleKey,
      module_label: moduleKey,
      entitled: true,
      features: [],
    };
  }

  if (!planId) {
    return {
      module_key: moduleKey,
      module_label: moduleKey,
      entitled: false,
      reason: "no_plan",
      features: [],
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
    console.error(`Error checking entitlement for module ${moduleKey}:`, error);
    return {
      module_key: moduleKey,
      module_label: moduleKey,
      entitled: false,
      reason: "error_checking_entitlement",
      features: [],
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

  // Supabase generates array-shaped data for RPCs declared as RETURNS TABLE.
  // Normalize both array and object responses so the caller has one stable contract.
  const result = Array.isArray(data) ? data[0] : data;

  if (!result?.success) {
    throw new Error(result?.message || "Failed to update plan modules");
  }

  return {
    success: true,
    message: result.message || "Plan modules updated successfully",
  };
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
    _description: input.description ?? undefined,
    _monthly_price_kes: input.monthly_price_kes,
    _yearly_price_kes: input.yearly_price_kes,
    _max_products: input.max_products,
    _max_users: input.max_users,
    _max_locations: input.max_locations,
    _max_customers: input.max_customers ?? 50,
    _max_suppliers: input.max_suppliers ?? 10,
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
    is_public?: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc("update_subscription_plan", {
    _package_id: planId,
    _name: input.name,
    _description: input.description ?? undefined,
    _monthly_price_kes: input.monthly_price_kes,
    _yearly_price_kes: input.yearly_price_kes,
    _max_products: input.max_products,
    _max_users: input.max_users,
    _max_locations: input.max_locations,
    _max_customers: input.max_customers ?? 50,
    _max_suppliers: input.max_suppliers ?? 10,
    _trial_days: input.trial_days,
    _is_active: input.is_active,
    ...(input.is_public === undefined ? {} : { _is_public: input.is_public }),
  } as any);

  if (error) {
    console.error("Error updating plan:", error);
    throw new Error(error.message);
  }

  // update_subscription_plan returns jsonb, but normalize array/object shapes defensively
  // so a RETURNS TABLE variant can never be read as "no success".
  const result: any = Array.isArray(data) ? data[0] : data;

  if (result && result.success === false) {
    throw new Error(result.message || "Failed to update plan");
  }

  return {
    success: true,
    message: result?.message || "Plan updated successfully",
  };
}
