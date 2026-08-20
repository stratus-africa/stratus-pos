// Legacy billing/subscription hook.
//
// This hook is responsible for billing state (subscription status, period end,
// payment provider codes). It is NOT the source of truth for module entitlements.
//
// Module entitlements are resolved exclusively via:
//   useEntitlement() → resolveBusinessEntitlement() → businesses.selected_package_id
//
// subscriptions.product_id is a billing-provider reference (Paystack plan code
// stored as text). It must NOT be used as a subscription_packages.id.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { findModule, moduleKeys } from "@/lib/modules";
import { resolvePreferredSubscription } from "@/lib/subscriptionPlan";

export type SubscriptionTier = "free" | "basic" | "pro";

interface Subscription {
  id: string;
  user_id: string;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  plan_code: string | null;
  product_id: string | null; // Billing-provider reference only — NOT a package UUID
  price_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
}

interface SubscriptionPackage {
  id: string;
  name: string;
  max_locations: number;
  max_products: number;
  max_users: number;
  paystack_plan_code_monthly: string | null;
  paystack_plan_code_yearly: string | null;
  monthly_price_kes: number;
  yearly_price_kes: number;
  sort_order: number;
}

interface PackageFeature {
  package_id: string;
  feature_key: string;
  enabled: boolean;
}

/**
 * Resolves feature access given a known package + enabled feature keys.
 * Used only by legacy callers — prefer useEntitlement().hasModule() instead.
 */
export function resolveFeatureAccess({
  isActive,
  currentPackage,
  enabledFeatureKeys,
  key,
}: {
  isActive: boolean;
  currentPackage?: SubscriptionPackage | null;
  enabledFeatureKeys?: Set<string>;
  key: string;
}) {
  const keys = moduleKeys(key);
  if (!isActive) return false;
  // Package must be resolved before granting access — never grant unconditionally.
  if (!currentPackage) return false;
  return keys.some((k) => {
    const normalized = (findModule(k)?.key ?? k).toLowerCase();
    return !!enabledFeatureKeys?.has(normalized);
  });
}

/**
 * @deprecated Use useEntitlement().hasModule() instead.
 * Kept for legacy callers until migration is complete.
 */
export function resolveModuleEntitlement({
  isActive,
  currentPackage,
  enabledModules,
  key,
}: {
  isActive: boolean;
  currentPackage?: SubscriptionPackage | null;
  enabledModules?: Set<string>;
  key: string;
}) {
  const keys = moduleKeys(key);
  if (!isActive) return false;
  if (!currentPackage) return false;
  return keys.some((k) => {
    const normalized = (findModule(k)?.key ?? k).toLowerCase();
    return !!enabledModules?.has(normalized);
  });
}

export function useSubscription() {
  const { user } = useAuth();
  const { business, refreshBusiness } = useBusiness();
  const queryClient = useQueryClient();

  const planUserId = business?.owner_id || user?.id || null;

  // ── Fetch the billing subscription row ──────────────────────────────────────
  const {
    data: subscription,
    isLoading: subLoading,
    error: subscriptionError,
  } = useQuery({
    queryKey: ["subscription", planUserId],
    queryFn: async () => {
      if (!planUserId) return null;

      // Do not rely on a single "current" RPC row here. Tenants can have
      // multiple historical subscriptions, including stale live records and
      // currently-active records. Fetch the owner's rows and let the shared
      // resolver choose the subscription that is actually valid now.
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          "id, user_id, paystack_subscription_code, paystack_customer_code, plan_code, product_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, environment, created_at, updated_at",
        )
        .eq("user_id", planUserId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const preferred = resolvePreferredSubscription((data || []) as any[]);
      return (preferred as unknown as Subscription) || null;
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  // ── Fetch the package assigned to this business ──────────────────────────────
  // AUTHORITATIVE source: businesses.selected_package_id only.
  // We do NOT use subscription.product_id to look up a package — product_id is
  // a billing-provider reference, not a subscription_packages UUID.
  const packageId = business?.selected_package_id ?? null;

  const {
    data: packagesData,
    isLoading: pkgLoading,
    error: packageFeaturesError,
  } = useQuery({
    queryKey: ["subscription_packages_with_features", planUserId, packageId],
    queryFn: async () => {
      // Load the public package catalog (for pricing pages etc.)
      const publicPkgs: any[] = [];
      const publicPackagesRes = await (supabase as any).rpc("get_public_subscription_packages");
      if (publicPackagesRes.error) throw publicPackagesRes.error;
      publicPkgs.push(...(publicPackagesRes.data || []));

      const pkgsById = new Map(publicPkgs.map((pkg) => [pkg.id, pkg]));

      // If the business has an assigned package that is not in the public list
      // (e.g. a private/custom plan), fetch it directly.
      if (packageId && !pkgsById.has(packageId)) {
        const [{ data: pkgRow, error: pkgErr }, { data: featRows, error: featErr }] = await Promise.all([
          (supabase as any).rpc("get_subscription_package_safe", { _id: packageId }),
          (supabase as any).rpc("get_package_features_safe", { _package_id: packageId }),
        ]);
        if (pkgErr) throw pkgErr;
        if (featErr) throw featErr;
        const pkg = Array.isArray(pkgRow) ? pkgRow[0] : null;
        if (pkg) pkgsById.set(pkg.id, { ...pkg, features: featRows || [] });
      }

      const allPackages = [...pkgsById.values()];

      // Load all public features
      let allFeatures: any[] = [];
      const publicFeatureRes = await (supabase as any).rpc("get_public_package_features");
      if (publicFeatureRes.error) throw publicFeatureRes.error;
      allFeatures.push(...(publicFeatureRes.data || []).filter((f: any) => Boolean(f.enabled)));

      // Supplement with features for the assigned package (may be private)
      if (packageId) {
        const featureIds = new Set(allFeatures.map((f) => `${f.package_id}:${f.feature_key}`));
        const safeRes = await (supabase as any).rpc("get_package_features_safe", { _package_id: packageId });
        if (safeRes.error) throw safeRes.error;
        for (const feature of safeRes.data || []) {
          if (!feature.enabled) continue;
          const key = `${feature.package_id}:${feature.feature_key}`;
          if (!featureIds.has(key)) {
            featureIds.add(key);
            allFeatures.push(feature);
          }
        }
      }

      return {
        packages: allPackages as unknown as SubscriptionPackage[],
        features: allFeatures.map((f) => ({ ...f, enabled: Boolean(f.enabled) })) as PackageFeature[],
      };
    },
    enabled: !!planUserId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // ── Realtime invalidation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!planUserId) return;
    const channelName = `subscription-changes-${planUserId}-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${planUserId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["subscription", planUserId] });
          queryClient.invalidateQueries({ queryKey: ["entitlement:active_subscription"] });
          queryClient.invalidateQueries({ queryKey: ["entitlement:canonical"] });
          refreshBusiness();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "package_features" }, () => {
        queryClient.invalidateQueries({ queryKey: ["subscription_packages_with_features"] });
        queryClient.invalidateQueries({ queryKey: ["entitlement:canonical"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_packages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["subscription_packages_with_features"] });
        queryClient.invalidateQueries({ queryKey: ["entitlement:canonical"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [planUserId, queryClient, refreshBusiness]);

  // ── Derive billing state ─────────────────────────────────────────────────────
  const isActive = subscription
    ? ["active", "trialing"].includes(subscription.status) &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
    : false;

  const packages = packagesData?.packages ?? [];
  const features = packagesData?.features ?? [];

  // Resolve the package object. Use ONLY selected_package_id — never product_id.
  const currentPackage: SubscriptionPackage | null = (() => {
    if (packageId) {
      const match = packages.find((pkg) => pkg.id === packageId);
      if (match) return match as SubscriptionPackage;
    }
    return null;
  })();

  const packageResolved = !!currentPackage || !packageId;
  const packageError =
    packageId && !currentPackage && !pkgLoading ? "Unable to load the assigned subscription package." : null;

  // Build enabledModules from package_features for the resolved package only.
  const enabledModules = new Set(
    features
      .filter((f) => f.package_id === currentPackage?.id && f.enabled)
      .map((f) => (findModule(f.feature_key)?.key ?? f.feature_key).toLowerCase()),
  );

  if (typeof window !== "undefined" && (window as any).__DEBUG_SUBSCRIPTION) {
    console.debug("[useSubscription]", {
      planUserId,
      packageId,
      subscription: subscription
        ? { id: subscription.id, status: subscription.status, product_id: subscription.product_id }
        : null,
      isActive,
      currentPackage: currentPackage ? { id: currentPackage.id, name: currentPackage.name } : null,
      features: features.length,
      enabledModules: Array.from(enabledModules),
    });
  }

  // ── Legacy hasModule — delegates to enabledModules derived above ─────────────
  const hasModule = (key: string): boolean =>
    resolveModuleEntitlement({ isActive, currentPackage, enabledModules, key });

  const hasFeatureKey = (key: string): boolean => hasModule(key);
  const tier: SubscriptionTier = isActive ? "pro" : "free";
  const hasFeature = (_requiredTier: SubscriptionTier): boolean => isActive;

  return {
    subscription,
    isLoading: subLoading || pkgLoading,
    isActive,
    tier,
    hasFeature,
    hasFeatureKey,
    hasModule,
    enabledModules,
    enabledFeatureKeys: enabledModules,
    currentPackage,
    packageResolved,
    packageError,
    packageMatchCandidates: packageId ? [packageId] : [],
    subscriptionError,
    featuresError: packageFeaturesError,
    error: packageError || subscriptionError || packageFeaturesError || null,
    maxProducts: currentPackage?.max_products ?? 0,
    maxLocations: currentPackage?.max_locations ?? 1,
    maxUsers: currentPackage?.max_users ?? 1,
    isCanceling: subscription?.cancel_at_period_end ?? false,
  };
}
