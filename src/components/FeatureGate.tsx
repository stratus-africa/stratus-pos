import React from "react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { Button } from "@/components/ui/button";
import { Lock, AlertTriangle, Building2 } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";

interface FeatureGateProps {
  /** Backwards-compat tier prop (rarely used now) */
  requiredTier?: string;
  /** Preferred: gate by module key from APP_MODULES (e.g. "reports", "banking") */
  moduleKey?: string;
  /** Plan-only feature key. Examples: "mpesa.stk_push", "digitax". */
  featureKey?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ requiredTier, moduleKey, children, fallback }: FeatureGateProps) {
  const { hasModule, hasFeatureKey, hasPlan, isLoading, resolutionStatus, entitlementError } = useEntitlement();
  const navigate = useNavigate();

  // ── State A+E: loading or db error ─────────────────────────────────────────
  if (isLoading) {
    return (
      fallback || (
        <div className="flex min-h-[160px] items-center justify-center py-8 text-sm text-muted-foreground">
          Checking access…
        </div>
      )
    );
  }

  // ── State E: database / RPC / network failure ───────────────────────────────
  // Show an actual error — NOT "Upgrade Required" — when the resolver itself failed.
  if (resolutionStatus === "db_error" || entitlementError) {
    return (
      fallback || (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <h3 className="text-lg font-semibold">Unable to check access</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            A database error occurred while loading your plan information. Please refresh the page.
            {entitlementError && (
              <span className="block mt-1 text-xs text-muted-foreground/70 font-mono break-all">
                {entitlementError}
              </span>
            )}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      )
    );
  }

  // ── State A: no business ────────────────────────────────────────────────────
  if (resolutionStatus === "no_business") {
    return (
      fallback || (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Building2 className="h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No business found</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your account is not linked to a business. Complete onboarding to continue.
          </p>
          <Button onClick={() => navigate("/onboarding")}>Set up business</Button>
        </div>
      )
    );
  }

  // ── State B: business exists but no package assigned ────────────────────────
  if (resolutionStatus === "no_plan" || resolutionStatus === "package_not_found") {
    return (
      fallback || (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Lock className="h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No subscription plan assigned</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {resolutionStatus === "package_not_found"
              ? "The subscription package assigned to this business could not be found. Contact your administrator."
              : "No subscription plan has been assigned to this business. Contact your administrator."}
          </p>
        </div>
      )
    );
  }

  // ── Determine access ────────────────────────────────────────────────────────
  // At this point we have a resolved plan. Check module access.
  const allowed = featureKey
    ? hasFeatureKey(featureKey)
    : moduleKey
      ? hasModule(moduleKey)
      : requiredTier
        ? hasPlan
        : true;

  if (!allowed) {
    // ── State C: plan has no modules enabled ──────────────────────────────────
    if (resolutionStatus === "no_enabled_features") {
      return (
        fallback || (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <Lock className="h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-semibold">No modules enabled</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Your current plan has no modules enabled. Contact your administrator to configure plan access.
            </p>
          </div>
        )
      );
    }

    // ── State F: plan has modules, but not this one / role lacks permission ───
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

  // ── State D: access granted ─────────────────────────────────────────────────
  return <>{children}</>;
}

/**
 * Route guard — blocks rendering and shows the appropriate gate screen if the
 * module isn't in the tenant's plan.
 */
export function RequireFeature({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const { hasModule, isLoading, resolutionStatus, entitlementError } = useEntitlement();

  if (isLoading) return null;

  // Surface db errors instead of silently blocking
  if (resolutionStatus === "db_error" || entitlementError) {
    return <FeatureGate moduleKey={moduleKey}>{children}</FeatureGate>;
  }

  if (!hasModule(moduleKey)) {
    return <FeatureGate moduleKey={moduleKey}>{children}</FeatureGate>;
  }

  return <>{children}</>;
}

/**
 * Returns plan-driven feature limits and access flags.
 * Derives everything from the canonical entitlement hook.
 */
export function useFeatureLimit() {
  const { hasModule, hasFeatureKey, isLoading, resolvedPackageName } = useEntitlement();

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
