import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getPaystackEnvironment } from "@/lib/paystack";

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
  const queryClient = useQueryClient();
  const environment = getPaystackEnvironment();

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", user?.id, environment],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", environment)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Subscription | null;
    },
    enabled: !!user,
  });

  const { data: packagesData, isLoading: pkgLoading } = useQuery({
    queryKey: ["subscription_packages_with_features"],
    queryFn: async () => {
      const [{ data: pkgs }, { data: feats }] = await Promise.all([
        supabase.from("subscription_packages").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("package_features").select("package_id, feature_key, enabled"),
      ]);
      return {
        packages: (pkgs || []) as unknown as SubscriptionPackage[],
        features: (feats || []) as PackageFeature[],
      };
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user) return;
    const channelName = `subscription-changes-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["subscription", user.id, environment] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, environment, queryClient]);

  const isActive = subscription
    ? ["active", "trialing"].includes(subscription.status) &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
    : false;

  const packages = packagesData?.packages ?? [];
  const features = packagesData?.features ?? [];

  // Resolve current package: by package id stored in product_id, then plan_code, fallback to lowest sort_order.
  const currentPackage: SubscriptionPackage | null = (() => {
    if (isActive && subscription) {
      const byId = packages.find((p) => p.id === subscription.product_id);
      if (byId) return byId;
      const byPlan = packages.find(
        (p) =>
          p.paystack_plan_code_monthly === subscription.plan_code ||
          p.paystack_plan_code_yearly === subscription.plan_code
      );
      if (byPlan) return byPlan;
    }
    return packages[0] ?? null;
  })();

  const enabledFeatureKeys = new Set(
    features.filter((f) => f.package_id === currentPackage?.id && f.enabled).map((f) => f.feature_key)
  );

  const hasFeatureKey = (key: string): boolean => {
    if (!currentPackage) return false;
    return enabledFeatureKeys.has(key);
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
    currentPackage,
    maxProducts: currentPackage?.max_products ?? 0,
    maxLocations: currentPackage?.max_locations ?? 1,
    maxUsers: currentPackage?.max_users ?? 1,
    isCanceling: subscription?.cancel_at_period_end ?? false,
  };
}
