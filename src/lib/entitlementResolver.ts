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
 * Global module catalogue status is informational. Plan entitlements are
 * authoritative: when a module is enabled on a subscription plan, tenants
 * on that plan must receive the module. The Super Admin can still control
 * plan-level availability from the Plans/Modules UI.
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

    if (canonicalKey) moduleSet.add(canonicalKey);

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
      if (!key) continue;
      moduleSet.add(key);
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

  const { data: featureRows, error: featureError } = await supabase
    .from("package_features")
    .select("*")
    .eq("package_id", pkg.id)
    .eq("enabled", true);

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
    if (canonicalKey) moduleSet.add(canonicalKey);
    if (directPrefix) moduleSet.add(directPrefix);
    for (const key of moduleKeys(rawKey)) {
      if (!key) continue;
      moduleSet.add(key.toLowerCase());
    }
  }
  // Core workspace modules are always entitled, independent of package_features.
  // This prevents a plan configuration from locking a tenant out of its own
  // dashboard, business settings, or profile. Role permissions remain separate.
  for (const coreModule of ALWAYS_ENTITLED_CORE_MODULES) {
    moduleSet.add(coreModule);
  }

  // Plan configuration is the authoritative entitlement source. Do not apply
  // the global module catalogue as a second deny layer; doing so caused plans
  // with an enabled module to incorrectly show "feature not available" when
  // the catalogue row itself was inactive.
  const enabledModules = [...moduleSet];

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

  // A plan may explicitly enable/disable an individual feature. For backwards
  // compatibility, an enabled module-level row grants all of that module's
  // features when no explicit feature row exists.
  let planFeatureAllowed = entitlement.entitled;
  if (planId && entitlement.entitled) {
    const { data: planFeatureRows } = await supabase
      .from("package_features")
      .select("feature_key, enabled")
      .eq("package_id", planId)
      .in("feature_key", [featureKey, `${moduleKey}.${featureKey}`]);

    const explicit = (planFeatureRows || []).find((row: any) => row.feature_key === featureKey);
    const moduleFeature = (planFeatureRows || []).find((row: any) => row.feature_key === `${moduleKey}.${featureKey}`);
    if (explicit) planFeatureAllowed = Boolean(explicit.enabled);
    else if (moduleFeature) planFeatureAllowed = Boolean(moduleFeature.enabled);
  }

  const userPermission = userPermissions.has(permissionKey);

  return {
    feature_key: featureKey,
    feature_label: (feature as ModuleFeature)?.feature_label || featureKey,
    allowed: planFeatureAllowed && userPermission,
    reason: !entitlement.entitled
      ? "module_not_entitled"
      : !planFeatureAllowed
        ? "feature_not_in_plan"
        : !userPermission
          ? "permission_denied"
          : undefined,
    module_entitled: entitlement.entitled,
    user_permission: userPermission,
  };
}

/**
 * Superadmin function: Update individual plan feature entitlements.
 * Feature keys are stored in package_features alongside module keys.
 */
export async function updatePlanFeatureKeys(
  planId: string,
  moduleKey: string,
  featureKeys: string[],
): Promise<{ success: boolean; message: string }> {
  const normalizedModule = getCanonicalFeatureKey(moduleKey).trim().toLowerCase();
  const normalizedFeatureKeys = [
    ...new Set(
      featureKeys.map((key) => key.trim().toLowerCase()).filter((key) => key.startsWith(`${normalizedModule}.`)),
    ),
  ];

  const { error: deleteError } = await supabase
    .from("package_features")
    .delete()
    .eq("package_id", planId)
    .like("feature_key", `${normalizedModule}.%`);

  if (deleteError) throw new Error(deleteError.message || "Failed to clear plan feature configuration");

  if (normalizedFeatureKeys.length) {
    const rows = normalizedFeatureKeys.map((featureKey) => ({
      package_id: planId,
      feature_key: featureKey,
      feature_label: featureKey
        .slice(normalizedModule.length + 1)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      enabled: true,
    }));

    const { error: insertError } = await supabase.from("package_features").insert(rows);
    if (insertError) throw new Error(insertError.message || "Failed to save plan feature configuration");
  }

  return {
    success: true,
    message: `${normalizedModule} feature configuration updated. ${normalizedFeatureKeys.length} feature(s) enabled.`,
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
  const normalizedKeys = [
    ...new Set(
      moduleKeys
        .map((key) => getCanonicalFeatureKey(key))
        .map((key) => key.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  // Prefer the secured RPC. Older deployments may not yet have the RPC migration
  // applied, however, so fall back to the RLS-protected package_features table.
  // This keeps existing plans editable while the database migration is being rolled out.
  const { data, error } = await supabase.rpc("set_plan_modules", {
    _package_id: planId,
    _module_keys: normalizedKeys,
  });

  if (!error) {
    const result = Array.isArray(data) ? data[0] : data;

    if (result?.success) {
      return {
        success: true,
        message: result.message || "Plan modules updated successfully",
      };
    }

    // An RPC can exist but still return a controlled failure. In that case,
    // try the RLS-protected table path before surfacing the error.
    console.warn("set_plan_modules returned an unsuccessful result; using table fallback:", result?.message);
  } else {
    console.warn("set_plan_modules RPC unavailable; using table fallback:", error.message);
  }

  const { error: deleteError } = await supabase.from("package_features").delete().eq("package_id", planId);

  if (deleteError) {
    console.error("Error clearing plan modules:", deleteError);
    throw new Error(deleteError.message || error?.message || "Failed to clear plan modules");
  }

  if (normalizedKeys.length > 0) {
    const rows = normalizedKeys.map((featureKey) => ({
      package_id: planId,
      feature_key: featureKey,
      feature_label: findModule(featureKey)?.label || featureKey.replace(/_/g, " "),
      enabled: true,
    }));

    const { error: insertError } = await supabase.from("package_features").insert(rows);

    if (insertError) {
      console.error("Error writing plan modules:", insertError);
      throw new Error(insertError.message || "Failed to save plan modules");
    }
  }

  return {
    success: true,
    message: `Plan modules updated successfully. ${normalizedKeys.length} module(s) enabled.`,
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

  if (!error && data) {
    return data as { success: boolean; message: string; package_id?: string };
  }

  // Some deployments do not yet have the create_subscription_plan RPC.
  // Super admins already have RLS permission on subscription_packages, so
  // create the plan directly as a safe backwards-compatible fallback.
  const { data: packageRow, error: insertError } = await supabase
    .from("subscription_packages")
    .insert({
      name: input.name.trim(),
      description: input.description ?? null,
      monthly_price_kes: input.monthly_price_kes,
      yearly_price_kes: input.yearly_price_kes,
      max_products: input.max_products,
      max_users: input.max_users,
      max_locations: input.max_locations,
      max_customers: input.max_customers ?? 50,
      max_suppliers: input.max_suppliers ?? 10,
      trial_days: input.trial_days,
      is_active: true,
      is_public: true,
    } as any)
    .select("id")
    .single();

  if (insertError || !packageRow) {
    console.error("Error creating plan:", error || insertError);
    throw new Error(insertError?.message || error?.message || "Failed to create plan");
  }

  return {
    success: true,
    message: `Plan "${input.name.trim()}" created`,
    package_id: packageRow.id,
  };
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

  const result: any = Array.isArray(data) ? data[0] : data;
  if (!error && result && result.success !== false) {
    return { success: true, message: result?.message || "Plan updated successfully" };
  }

  // Backwards-compatible fallback for projects where the update RPC is missing.
  const { error: updateError } = await supabase
    .from("subscription_packages")
    .update({
      name: input.name.trim(),
      description: input.description ?? null,
      monthly_price_kes: input.monthly_price_kes,
      yearly_price_kes: input.yearly_price_kes,
      max_products: input.max_products,
      max_users: input.max_users,
      max_locations: input.max_locations,
      max_customers: input.max_customers ?? 50,
      max_suppliers: input.max_suppliers ?? 10,
      trial_days: input.trial_days,
      is_active: input.is_active,
      ...(input.is_public === undefined ? {} : { is_public: input.is_public }),
    } as any)
    .eq("id", planId);

  if (updateError) {
    console.error("Error updating plan:", error || updateError);
    throw new Error(updateError.message || error?.message || "Failed to update plan");
  }

  return { success: true, message: "Plan updated successfully" };
}
