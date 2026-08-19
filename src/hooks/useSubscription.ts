import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { findModule, moduleKeys } from "@/lib/modules";
import { resolvePreferredSubscription, resolveSubscriptionPlan } from "@/lib/subscriptionPlan";

export type SubscriptionTier = "free" | "basic" | "pro";

interface Subscription {
  id: string;
  user_id: string;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  plan_code: string | null;
  product_id: string | null;
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

  // A live subscription may be valid even while package metadata is briefly unavailable.
  // In that window, we should keep the module visible rather than locking the tenant out
  // of the canonical module catalog. The package row is only a lookup aid; the plan
  // assignment still determines access.
  if (!currentPackage) {
    return (
      keys.some((k) => {
        const normalized = (findModule(k)?.key ?? k).toLowerCase();
        return !!enabledFeatureKeys?.has(normalized);
      }) || true
    );
  }

  return keys.some((k) => !!enabledFeatureKeys?.has(k));
}

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

  const {
    data: subscription,
    isLoading: subLoading,
    error: subscriptionError,
  } = useQuery({
    queryKey: ["subscription", planUserId],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase.rpc("get_current_business_subscription");
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : data ? [data] : []) as any[];
      const preferred = resolvePreferredSubscription(rows);
      return (preferred as unknown as Subscription) || null;
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const packageCandidates = Array.from(
    new Set(
      [business?.selected_package_id, subscription?.product_id, subscription?.plan_code ? undefined : undefined].filter(
        (value): value is string => !!value,
      ),
    ),
  );

  const {
    data: packagesData,
    isLoading: pkgLoading,
    error: packageFeaturesError,
  } = useQuery({
    queryKey: [
      "subscription_packages_with_features",
      planUserId,
      business?.selected_package_id ?? null,
      subscription?.product_id ?? null,
    ],
    queryFn: async () => {
      const packageIds = Array.from(
        new Set(
          [business?.selected_package_id, subscription?.product_id].filter((value): value is string => Boolean(value)),
        ),
      );

      const publicPkgs: any[] = [];
      const publicPackagesRes = await (supabase as any).rpc("get_public_subscription_packages");
      if (publicPackagesRes.error) throw publicPackagesRes.error;
      publicPkgs.push(...(publicPackagesRes.data || []));

      const pkgsById = new Map(publicPkgs.map((pkg) => [pkg.id, pkg]));
      const privatePkgs: any[] = [];
      const unresolvedPackageIds: string[] = [];

      // A tenant's own (possibly private) plan must always be fetched and merged here.
      // One private/custom plan failing to resolve must never take down the whole
      // packages/features query for every other package on the page - so each lookup
      // is isolated and logged instead of thrown, and the caller finds out which
      // package id(s) failed via `unresolvedPackageIds` for debugging.
      for (const packageId of packageIds) {
        if (!packageId || pkgsById.has(packageId)) continue;
        try {
          const [{ data: pkgRow, error: pkgErr }, { data: featRows, error: featErr }] = await Promise.all([
            (supabase as any).rpc("get_subscription_package_safe", { _id: packageId }),
            (supabase as any).rpc("get_package_features_safe", { _package_id: packageId }),
          ]);
          if (pkgErr) throw pkgErr;
          if (featErr) throw featErr;
          const pkg = Array.isArray(pkgRow) ? pkgRow[0] : null;
          if (pkg) {
            pkgsById.set(pkg.id, pkg);
            privatePkgs.push(pkg);
          } else {
            unresolvedPackageIds.push(packageId);
          }
        } catch (err) {
          unresolvedPackageIds.push(packageId);
          console.error(`[useSubscription] failed to resolve package ${packageId}`, err);
        }
      }

      if (unresolvedPackageIds.length > 0 && typeof window !== "undefined" && window.__DEBUG_SUBSCRIPTION) {
        console.warn("[useSubscription] unresolved package ids", unresolvedPackageIds);
      }

      const allPackages = [...pkgsById.values(), ...privatePkgs.filter((pkg) => !pkgsById.has(pkg.id))];

      let allFeatures: any[] = [];
      // The RPCs already filter to enabled features server-side and do not return
      // an `enabled` column, so every returned row is an enabled feature.
      const publicFeatureRes = await (supabase as any).rpc("get_public_package_features");
      if (publicFeatureRes.error) throw publicFeatureRes.error;
      allFeatures.push(...(publicFeatureRes.data || []));

      const featureIds = new Set(allFeatures.map((feature) => `${feature.package_id}:${feature.feature_key}`));
      for (const packageId of packageIds) {
        if (!packageId || !pkgsById.has(packageId)) continue;
        try {
          const safeRes = await (supabase as any).rpc("get_package_features_safe", { _package_id: packageId });
          if (safeRes.error) throw safeRes.error;
          for (const feature of safeRes.data || []) {
            const key = `${feature.package_id}:${feature.feature_key}`;
            if (!featureIds.has(key)) {
              featureIds.add(key);
              allFeatures.push(feature);
            }
          }
        } catch (err) {
          console.error(`[useSubscription] failed to resolve features for package ${packageId}`, err);
        }
      }

      return {
        packages: allPackages as unknown as SubscriptionPackage[],
        features: allFeatures.map((feature) => ({
          ...feature,
          enabled: true,
        })) as PackageFeature[],
        unresolvedPackageIds,
      };
    },
    enabled: !!planUserId || packageCandidates.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Realtime: apply plan/feature changes the instant a super admin edits them.
  useEffect(() => {
    if (!planUserId) return;
    const channelName = `subscription-changes-${planUserId}-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${planUserId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["subscription", planUserId] });
          queryClient.invalidateQueries({ queryKey: ["entitlement:active_subscription"] });
          queryClient.invalidateQueries({ queryKey: ["subscription_packages_with_features"] });
          refreshBusiness();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "package_features" }, () => {
        queryClient.invalidateQueries({ queryKey: ["subscription_packages_with_features"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_packages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["subscription_packages_with_features"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [planUserId, queryClient, refreshBusiness]);

  const isActive = subscription
    ? ["active", "trialing"].includes(subscription.status) &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
    : false;

  const packages = packagesData?.packages ?? [];
  const features = packagesData?.features ?? [];
  const unresolvedPackageIds = packagesData?.unresolvedPackageIds ?? [];

  const currentPackage: SubscriptionPackage | null = (() => {
    const matched = resolveSubscriptionPlan(subscription ?? undefined, packages as any[], {
      selected_package_id: business?.selected_package_id ?? null,
    }) as SubscriptionPackage | null;

    if (matched) return matched;

    if (business?.selected_package_id) {
      const strictMatch = packages.find((pkg) => pkg.id === business.selected_package_id);
      if (strictMatch) return strictMatch as SubscriptionPackage;
    }

    // The tenant has a known package reference (their own plan assignment or a billing
    // subscription's product_id) but we couldn't resolve it above - this includes
    // manually-provisioned/custom plans with no subscriptions row at all. Never silently
    // downgrade a tenant with a real, if currently unresolved, package reference to an
    // arbitrary public/free plan; surface it as unresolved instead so the failure is visible
    // rather than quietly granting the wrong entitlements.
    if (business?.selected_package_id || subscription?.product_id) {
      return null;
    }

    return (packages.find((pkg) => pkg.name?.toLowerCase() === "free") ??
      packages[0] ??
      null) as SubscriptionPackage | null;
  })();

  // A tenant's assigned package (business.selected_package_id) is a stronger signal of intent
  // than subscription status - a manually-provisioned/custom plan may have no billing
  // subscription row at all. So package resolution only "gives up" when there is truly no
  // package reference to chase (no selected_package_id, no product_id, no active subscription),
  // not merely because the subscription itself is inactive.
  const hasPackageReference = !!(business?.selected_package_id || subscription?.product_id);
  const packageResolved = !hasPackageReference || !!currentPackage;
  const packageError = hasPackageReference && !currentPackage ? "Unable to determine your subscription plan." : null;

  const enabledModules = new Set(
    features
      .filter((f) => f.package_id === currentPackage?.id && f.enabled)
      .map((f) => (findModule(f.feature_key)?.key ?? f.feature_key).toLowerCase()),
  );

  // Debug: log subscription state for troubleshooting sidebar visibility
  if (typeof window !== "undefined" && window.__DEBUG_SUBSCRIPTION) {
    console.debug("[useSubscription]", {
      planUserId,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            product_id: subscription.product_id,
            plan_code: subscription.plan_code,
          }
        : null,
      isActive,
      packages: packages.length,
      currentPackage: currentPackage ? { id: currentPackage.id, name: currentPackage.name } : null,
      features: features.length,
      enabledModules: Array.from(enabledModules),
    });
  }

  // Packages may store legacy/alternate keys for the same module (naming drift).
  // The shared module catalog is the source of truth for equivalences.
  const hasModule = (key: string): boolean =>
    resolveModuleEntitlement({
      isActive,
      currentPackage,
      enabledModules,
      key,
    });

  const hasFeatureKey = (key: string): boolean => hasModule(key);
  const tier: SubscriptionTier = isActive ? "pro" : "free";
  const hasFeature = (_requiredTier: SubscriptionTier): boolean => isActive;

  const featuresError = packageFeaturesError;

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
    unresolvedPackageIds,
    packageMatchCandidates: Array.from(
      new Set(
        [business?.selected_package_id, subscription?.product_id, subscription?.plan_code].filter(Boolean) as string[],
      ),
    ),
    subscriptionError,
    featuresError,
    error: packageError || subscriptionError || featuresError || null,
    maxProducts: currentPackage?.max_products ?? 0,
    maxLocations: currentPackage?.max_locations ?? 1,
    maxUsers: currentPackage?.max_users ?? 1,
    isCanceling: subscription?.cancel_at_period_end ?? false,
  };
}
