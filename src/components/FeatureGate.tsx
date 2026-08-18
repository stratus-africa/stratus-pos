import React from "react";
import { useSubscription, type SubscriptionTier } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";

interface FeatureGateProps {
  /** Backwards-compat tier prop (rarely used now) */
  requiredTier?: SubscriptionTier;
  /** Preferred: gate by feature key from package_features (e.g. "reports", "banking") */
  featureKey?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ requiredTier, featureKey, children, fallback }: FeatureGateProps) {
  const { hasFeature, hasModule, hasFeatureKey, isLoading, currentPackage } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) return <>{children}</>;

  const allowed = featureKey ? hasModule(featureKey) : requiredTier ? hasFeature(requiredTier) : true;

  if (!allowed) {
    return (
      fallback || (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Lock className="h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Upgrade Required</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This feature isn't included in your current{currentPackage ? ` ${currentPackage.name}` : ""} plan. Upgrade
            to unlock it.
          </p>
          <Button onClick={() => navigate("/settings?tab=subscription")}>View Plans</Button>
        </div>
      )
    );
  }

  return <>{children}</>;
}

/**
 * Route guard. Use to protect a route or section so users on plans
 * without the given feature key are blocked from rendering it
 * (and redirected to the subscription tab).
 */
export function RequireFeature({ featureKey, children }: { featureKey: string; children: React.ReactNode }) {
  const { hasModule, isLoading } = useSubscription();
  if (isLoading) return null;
  if (!hasModule(featureKey)) {
    return <FeatureGate featureKey={featureKey}>{children}</FeatureGate>;
  }
  return <>{children}</>;
}

/**
 * Returns plan-driven feature limits and access flags.
 * Limits and access come directly from the user's resolved subscription_package
 * + its package_features rows.
 */
export function useFeatureLimit() {
  const { currentPackage, maxProducts, maxLocations, maxUsers, hasModule, hasFeatureKey, isLoading, tier } =
    useSubscription();

  // Convention: 0 or negative in the package row means "unlimited".
  const toLimit = (n: number, fallback: number) => (n > 0 ? n : fallback);

  return {
    isLoading,
    currentPackage,
    maxProducts: toLimit(maxProducts, Infinity),
    maxLocations: toLimit(maxLocations, Infinity),
    maxUsers: toLimit(maxUsers, Infinity),
    canAccessReports: hasModule("reports"),
    canAccessBanking: hasModule("banking"),
    canAccessChartOfAccounts: hasModule("chart_of_accounts"),
    canUseMultiLocation: hasModule("multi_location"),
    hasFeatureKey: hasModule,
    tier,
  };
}
