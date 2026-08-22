// Unified entitlement resolver hook
// Replaces the pattern of useSubscription + useModuleAccess with a single, clean API
// This is the authoritative hook for checking access.
//
// Resolution path (canonical):
//   auth.uid()
//     → businesses.selected_package_id          ← ONLY application-level plan ID
//     → subscription_packages
//     → package_features (enabled = true)
//     → canonical module keys
//     → sidebar / FeatureGate / routes
//
// subscriptions.product_id is a billing-provider reference and is NOT used here.

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  type EntitlementResolutionStatus,
} from "@/lib/entitlementResolver";
import type { ModuleEntitlement, FeatureAccess, ModuleFeature } from "@/types/entitlement";
import { getFeature } from "@/lib/featureCatalog";

interface UseEntitlementOptions {
  enabled?: boolean;
}

/**
 * Unified hook for all entitlement checks.
 *
 * Usage:
 *   const { hasModule, hasPlan, isLoading, resolutionStatus, entitlementError } = useEntitlement();
 *   if (hasModule("accounting")) { ... }
 */
export function useEntitlement(options: UseEntitlementOptions = {}) {
  const { enabled = true } = options;
  const { user } = useAuth();
  const { business } = useBusiness();
  const { permissions } = usePermissions();
  const queryClient = useQueryClient();

  // ─── Subscription row (billing state only — NOT used as package ID) ──────────
  // We fetch this so the subscription expiry/status is available to consumers
  // (e.g. BusinessContext posting guard), but we do NOT use product_id to look
  // up the plan. businesses.selected_package_id is the sole package reference.
  const { data: activeSubscription, isLoading: isLoadingSubscription } = useQuery({
    queryKey: ["entitlement:active_subscription", user?.id, business?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_current_business_subscription");
      if (error) {
        // RPC failure must not cascade into "Upgrade Required". Log and return null
        // so the canonical query (which uses selected_package_id directly) governs.
        console.warn("[useEntitlement] get_current_business_subscription failed:", error.message);
        return null;
      }
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

  // ─── AUTHORITATIVE package ID — comes ONLY from businesses.selected_package_id ─
  const packageId: string | null = business?.selected_package_id ?? null;

  // ─── Canonical entitlement — the single source of truth ──────────────────────
  // resolveBusinessEntitlement reads selected_package_id → subscription_packages
  // → package_features and returns the full entitlement result including
  // resolutionStatus and error. We pass activeSubscription purely so it's
  // available in the result object for billing-state consumers.
  const {
    data: canonicalEntitlement,
    isLoading: isLoadingCanonical,
    error: canonicalQueryError,
  } = useQuery({
    queryKey: ["entitlement:canonical", business?.id, packageId],
    queryFn: () => resolveBusinessEntitlement({ business, activeSubscription }),
    enabled: enabled && !!business?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // ─── Realtime invalidation is handled by useSubscription ─────────────────────
  // useSubscription already listens to package_features and subscription_packages
  // changes and invalidates ["entitlement:canonical"]. No second realtime listener
  // is needed here — adding one causes a blank-screen crash when the Supabase
  // realtime socket throws during React's commit phase.

  // ─── Derive the result ────────────────────────────────────────────────────────
  // While the canonical query is still loading we use a safe loading sentinel so
  // consumers see isLoading=true and don't prematurely render "Upgrade Required".
  const isLoading = isLoadingSubscription || isLoadingCanonical;

  const entitlement = canonicalEntitlement ?? {
    hasPlan: false,
    subscription: null,
    package: null,
    packageId: packageId,
    packageName: null,
    packageFeatures: [],
    enabledModules: [] as string[],
    resolutionStatus: (business?.id
      ? packageId
        ? "loading"
        : "no_plan"
      : "no_business") as EntitlementResolutionStatus,
    error: canonicalQueryError ? (canonicalQueryError as Error).message : null,
  };

  // ─── Debug logging ────────────────────────────────────────────────────────────
  if (typeof window !== "undefined" && (window as any).__DEBUG_ENTITLEMENT) {
    console.debug("[useEntitlement]", {
      authUserId: user?.id,
      businessId: business?.id,
      selectedPackageId: business?.selected_package_id,
      packageId,
      isLoading,
      resolutionStatus: entitlement.resolutionStatus,
      hasPlan: entitlement.hasPlan,
      enabledModules: entitlement.enabledModules,
      error: entitlement.error,
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Returns true only when:
   *   1. Entitlement has resolved (not loading)
   *   2. The tenant's plan includes this module (package_features.enabled = true)
   *
   * Returns false — never throws — on any error or loading state so callers
   * don't accidentally show content before access is confirmed.
   */
  const hasModule = (moduleKey: string): boolean => {
    if (isLoading) return false;
    if (!entitlement.enabledModules || entitlement.enabledModules.length === 0) return false;
    const normalized = moduleKey.toLowerCase();
    return entitlement.enabledModules.some(
      (key: string) => key.toLowerCase() === normalized || key.toLowerCase().startsWith(`${normalized}.`),
    );
  };

  /**
   * Returns true when the selected plan includes the requested feature.
   *
   * package_features may contain either:
   *   - the module row (e.g. "mpesa"), which grants the module's features
   *     for backwards compatibility, or
   *   - an explicit feature row (e.g. "mpesa.stk_push" / "stk_push").
   *
   * This is deliberately separate from role permissions. A feature being
   * included in a plan must never be reported as "not in the plan" simply
   * because the current role lacks permission to use it.
   */
  const hasPlanFeature = (moduleKey: string, featureKey: string): boolean => {
    if (!hasModule(moduleKey)) return false;

    const normalizedModule = moduleKey.trim().toLowerCase();
    const normalizedFeature = featureKey.trim().toLowerCase();
    if (!normalizedModule || !normalizedFeature) return false;

    const rows = (entitlement.packageFeatures || []) as Array<{ feature_key?: string; enabled?: boolean }>;
    const exactCandidates = new Set([normalizedFeature, `${normalizedModule}.${normalizedFeature}`]);

    const explicit = rows.find((row) => {
      const key = String(row.feature_key || "")
        .trim()
        .toLowerCase();
      return exactCandidates.has(key);
    });

    if (explicit) return explicit.enabled === true;

    // A module-level plan row grants its catalogue features unless the plan
    // has an explicit feature row overriding that default.
    const moduleRow = rows.find(
      (row) =>
        String(row.feature_key || "")
          .trim()
          .toLowerCase() === normalizedModule,
    );
    if (moduleRow) return moduleRow.enabled === true;

    // If the module is resolved into enabledModules from a feature-level row,
    // require that feature to be explicitly enabled rather than assuming it.
    return false;
  };

  /**
   * Full feature access = plan entitlement + role permission.
   * FeatureGate/UI consumers should use this check for actionable features.
   */
  const hasFeature = (moduleKey: string, featureKey: string): boolean => {
    if (!hasPlanFeature(moduleKey, featureKey)) return false;

    const feature = getFeature(`${moduleKey}.${featureKey}`) || getFeature(featureKey);
    const permissionKey = feature?.permissionKey || `${moduleKey}.${featureKey}`;

    return permissions.has("*") || permissions.has(permissionKey);
  };

  /**
   * Plan-only feature check for legacy/UI visibility callers.
   *
   * This deliberately does NOT check role permissions. Role permissions are
   * handled by hasFeature()/PermissionGuard. This prevents a role denial from
   * being misreported as a missing plan feature.
   */
  const hasFeatureKey = (featureKey: string): boolean => {
    const raw = featureKey.trim().toLowerCase();
    if (!raw) return false;

    const definition = getFeature(raw) || getFeature(raw.includes(".") ? raw : `${raw}.view`);
    if (definition) {
      return hasPlanFeature(definition.moduleKey, definition.key);
    }

    // Legacy module-level keys such as "digitax", "batch_tracking" or
    // "chart_of_accounts" are normalized through hasModule().
    return hasModule(raw);
  };

  const getEntitledModules = (): string[] => entitlement.enabledModules || [];

  const checkModuleAccess = (moduleKey: string) => checkModuleEntitlement(packageId || undefined, moduleKey);

  const checkFeatureAccessFn = (moduleKey: string, featureKey: string) =>
    checkFeatureAccess(packageId || undefined, moduleKey, featureKey, permissions);

  const getAccessibleModuleFeatures = async (moduleKey: string): Promise<ModuleFeature[]> => {
    if (!hasModule(moduleKey)) return [];
    const features = await getModuleFeatures(moduleKey);
    return features.filter((f) => permissions.has(f.permission_key));
  };

  return {
    // ── Access checks ──────────────────────────────────────────────────────
    hasModule,
    hasPlanFeature,
    hasFeature,
    hasFeatureKey,
    checkModuleAccess,
    checkFeatureAccess: checkFeatureAccessFn,
    getEntitledModules,
    getAccessibleModuleFeatures,

    // ── Plan data ──────────────────────────────────────────────────────────
    planModules: entitlement.enabledModules || [],
    allPlanFeatures: entitlement.packageFeatures || [],
    hasPlan: entitlement.hasPlan,
    plan: entitlement.package,
    planId: entitlement.packageId,
    package: entitlement.package,
    packageName: entitlement.packageName,

    // ── Billing subscription (for billing-state consumers only) ────────────
    activeSubscription,

    // ── Loading / error state ──────────────────────────────────────────────
    isLoading,
    isReady: !isLoading,
    resolutionStatus: entitlement.resolutionStatus,
    entitlementError: entitlement.error ?? (canonicalQueryError ? (canonicalQueryError as Error).message : null),

    // ── Legacy aliases ─────────────────────────────────────────────────────
    resolvedPlanId: entitlement.packageId,
    resolvedPackageName: entitlement.packageName,
    userRole: business?.owner_id === user?.id ? "owner" : "member",
  };
}

/**
 * Hook for tenant admins to list features available to assign to roles.
 * Derives the list from the tenant's plan entitlement — no separate query.
 */
export function useModuleManagement() {
  const { business } = useBusiness();

  const { data: availableFeatures, isLoading } = useQuery({
    queryKey: ["module_management:available_features", business?.id, business?.selected_package_id],
    queryFn: async () => {
      if (!business?.id || !business.selected_package_id) return [];
      const planModules = await getPlanModules(business.selected_package_id);
      if (!planModules) return [];
      const allFeatures: ModuleFeature[] = [];
      for (const moduleKey of planModules.modules) {
        const features = await getModuleFeatures(moduleKey);
        allFeatures.push(...features);
      }
      return allFeatures;
    },
    enabled: !!business?.id && !!business?.selected_package_id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    availableFeatures: availableFeatures || [],
    isLoading,
    canAssignFeature: (featureKey: string) => availableFeatures?.some((f) => f.feature_key === featureKey) ?? false,
  };
}

/**
 * Superadmin-only plan management capabilities.
 */
export function usePlanManagement() {
  const { user } = useAuth();
  const isSuperAdmin = user?.user_metadata?.is_super_admin === true;
  return {
    isSuperAdmin,
    canManagePlans: isSuperAdmin,
  };
}
