import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { getPaystackEnvironment } from "@/lib/paystack";
import { moduleKeys } from "@/lib/modules";
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

export function useSubscription() {
  const { user } = useAuth();
  const { business, refreshBusiness } = useBusiness();
  const queryClient = useQueryClient();
  const environment = getPaystackEnvironment();

  // Plan is attached to the business owner's user_id. Resolving here ensures
  // ALL tenant users (owner + staff) see plan changes made by a super admin
  // immediately — not just the owner logged into their own account.
  const planUserId = business?.owner_id || user?.id || null;

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", planUserId, environment],
    queryFn: async () => {
      if (!planUserId) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", planUserId)
        .eq("environment", environment)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const preferred = resolvePreferredSubscription((data || []) as any[]);
      return (preferred as unknown as Subscription) || null;
    },
    enabled: !!planUserId,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const { data: packagesData, isLoading: pkgLoading } = useQuery({
    queryKey: ["subscription_packages_with_features", subscription?.product_id ?? null],
    queryFn: async () => {
      const [pubRes, featRes] = await Promise.all([
        (supabase as any).rpc("get_public_subscription_packages"),
        (supabase as any).rpc("get_public_package_features"),
      ]);
      const publicPkgs: any[] = pubRes.data || [];
      let allPkgs = publicPkgs;
      let allFeatures: any[] = featRes.data || [];
      // If the user is subscribed to a private/hidden package, fetch it + its features separately.
      if (subscription?.product_id && !publicPkgs.find((p) => p.id === subscription.product_id)) {
        const [{ data: priv }, { data: privFeats }] = await Promise.all([
          (supabase as any).rpc("get_subscription_package_safe", { _id: subscription.product_id }),
          (supabase as any).rpc("get_package_features_safe", { _package_id: subscription.product_id }),
        ]);
        if (priv && priv.length > 0) allPkgs = [...publicPkgs, priv[0]];
        if (privFeats && privFeats.length > 0) allFeatures = [...allFeatures, ...privFeats];
      }
      return {
        packages: allPkgs as unknown as SubscriptionPackage[],
        features: (allFeatures as any[]).map((f) => ({ ...f, enabled: true })) as PackageFeature[],
      };
    },
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
          queryClient.invalidateQueries({ queryKey: ["subscription", planUserId, environment] });
          queryClient.invalidateQueries({ queryKey: ["subscription_packages_with_features"] });
          // Refresh business context so posting guard / expiry banner also update.
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
  }, [planUserId, environment, queryClient, refreshBusiness]);

  const isActive = subscription
    ? ["active", "trialing"].includes(subscription.status) &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
    : false;

  const packages = packagesData?.packages ?? [];
  const features = packagesData?.features ?? [];

  // Resolve current package: by package id stored in product_id, then plan_code, fallback to lowest sort_order.
  const currentPackage: SubscriptionPackage | null = (() => {
    const matched = resolveSubscriptionPlan(subscription ?? undefined, packages as any[], {
      selected_package_id: business?.selected_package_id ?? null,
    }) as SubscriptionPackage | null;

    if (matched) return matched;
    return (packages.find((p) => p.name?.toLowerCase() === "free") ??
      packages[0] ??
      null) as SubscriptionPackage | null;
  })();

  const enabledFeatureKeys = new Set(
    features.filter((f) => f.package_id === currentPackage?.id && f.enabled).map((f) => f.feature_key),
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
      enabledFeatureKeys: Array.from(enabledFeatureKeys),
    });
  }

  // Packages may store legacy/alternate keys for the same module (naming drift).
  // The shared module catalog is the source of truth for equivalences.
  const hasFeatureKey = (key: string): boolean => {
    if (!currentPackage) return false;
    // If subscription is active but features list is empty, assume all modules are enabled.
    // This handles the case where features haven't been seeded yet or there's no feature data.
    // The feature data is informational; active subscription = feature access.
    if (isActive && enabledFeatureKeys.size === 0) {
      return true;
    }
    return moduleKeys(key).some((k) => enabledFeatureKeys.has(k));
  };

  const tier: SubscriptionTier = isActive ? "pro" : "free";
  const hasFeature = (_requiredTier: SubscriptionTier): boolean => isActive;

  return {
    subscription,
    isLoading: subLoading || pkgLoading,
    isActive,
    tier,
    hasFeature,
    hasFeatureKey,
    enabledFeatureKeys,
    currentPackage,
    maxProducts: currentPackage?.max_products ?? 0,
    maxLocations: currentPackage?.max_locations ?? 1,
    maxUsers: currentPackage?.max_users ?? 1,
    isCanceling: subscription?.cancel_at_period_end ?? false,
  };
}
