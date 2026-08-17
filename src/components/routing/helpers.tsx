import type { ReactNode } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { findModule, getModuleRouteAccess } from "@/lib/modules";

export const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

export const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
    <p className="text-muted-foreground">You don't have permission to view this page.</p>
  </div>
);

/**
 * Permission-first guard ported from the pre-migration App.tsx `guard()` helper:
 * a granted permission grants access regardless of role. `permission` is
 * optional — when omitted, the route is open to any signed-in user. While
 * permissions are still loading, show a loader instead of flashing AccessDenied.
 */
export function PermissionGuard({
  permission,
  moduleKey,
  route,
  children,
}: {
  permission?: string;
  moduleKey?: string;
  route?: string;
  children: ReactNode;
}) {
  const { userRole } = useBusiness();
  const { permissions, hasPermission, isLoading } = usePermissions();
  const { hasFeatureKey } = useSubscription();

  if (moduleKey) {
    if (isLoading) return <PageLoader />;
    const registryAccess = getModuleRouteAccess(moduleKey, route ?? findModule(moduleKey)?.route ?? undefined, {
      role: userRole,
      permissions,
      subscriptions: new Set(),
      featureKey: hasFeatureKey,
      moduleEnabled: () => true,
      dependenciesReady: () => true,
      setupComplete: () => true,
    });
    if (!registryAccess.allowed) return <AccessDenied />;
    return <>{children}</>;
  }

  if (permission) {
    if (isLoading) return <PageLoader />;
    if (!hasPermission(permission)) return <AccessDenied />;
  }
  return <>{children}</>;
}
