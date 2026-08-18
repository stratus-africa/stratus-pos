import React from "react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";

interface FeatureGateProps {
  /** Backwards-compat tier prop (rarely used now) */
  requiredTier?: string;
  /** Preferred: gate by module key from modules (e.g. "reports", "banking") */
  moduleKey?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ requiredTier, moduleKey, children, fallback }: FeatureGateProps) {
  const { hasModule, hasPlan, isLoading: entitlementLoading } = useEntitlement();
  const navigate = useNavigate();

  const isLoading = entitlementLoading;

  if (isLoading) {
    return (
      fallback || (
        <div className="flex min-h-[160px] items-center justify-center py-8 text-sm text-muted-foreground">
          Checking access...
        </div>
      )
    );
  }

  const allowed = moduleKey ? hasModule(moduleKey) : requiredTier ? hasPlan : true;

  if (!allowed) {
    return (
      fallback || (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Lock className="h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Upgrade Required</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This feature isn't included in your current plan. Upgrade to unlock it.
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
 * without the given module key are blocked from rendering it
 * (and redirected to the subscription tab).
 */
export function RequireFeature({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const { hasModule, isLoading } = useEntitlement();
  if (isLoading) return null;
  if (!hasModule(moduleKey)) {
    return <FeatureGate moduleKey={moduleKey}>{children}</FeatureGate>;
  }
  return <>{children}</>;
}

/**
 * Returns plan-driven feature limits and access flags.
 * Limits and access come directly from the user's resolved subscription_package
 * + its package_features rows.
 */
export function useFeatureLimit() {
  const { hasModule, isLoading: entitlementLoading, resolvedPackageName } = useEntitlement();

  const isLoading = entitlementLoading;

  const hasFeatureKey = (featureKey: string) => hasModule(featureKey);

  return {
    isLoading,
    currentPackage: resolvedPackageName ? { name: resolvedPackageName } : null,
    maxProducts: Infinity,
    maxLocations: Infinity,
    maxUsers: Infinity,
    canAccessReports: hasModule("reports"),
    canAccessBanking: hasModule("banking"),
    canAccessChartOfAccounts: hasModule("accounting"),
    canUseMultiLocation: hasModule("inventory"),
    hasModule,
    hasFeatureKey,
  };
}
