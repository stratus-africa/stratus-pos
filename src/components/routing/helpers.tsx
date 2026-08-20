import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useBusiness } from "@/contexts/BusinessContext";
import { findModule } from "@/lib/modules";

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
 * Route-level access guard.
 *
 * When `moduleKey` is supplied it checks BOTH:
 *   1. Plan entitlement — is this module included in the tenant's plan?
 *      (via useEntitlement, which reads businesses.selected_package_id → package_features)
 *   2. Role permission — does this user have the required permission key?
 *      (via usePermissions, which reads role_permissions with default fallback)
 *
 * When only `permission` is supplied, only the role permission is checked.
 * When neither is supplied, any signed-in user is allowed through.
 *
 * Shows <PageLoader /> while entitlement or permissions are still loading to
 * prevent premature Access Denied flashes.
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
  const { hasPermission, isLoading: permLoading } = usePermissions();
  const { userRole } = useBusiness();
  // Use the canonical entitlement hook (businesses.selected_package_id → package_features).
  // This replaces the legacy useSubscription path which required an active billing
  // subscription and returned false for manually-approved tenants without a live
  // Paystack subscription row.
  const { hasModule, isLoading: entitlementLoading } = useEntitlement();

  const isLoading = permLoading || entitlementLoading;

  if (moduleKey) {
    // Wait for both permissions and entitlement to finish loading.
    if (isLoading) return <PageLoader />;

    const module = findModule(moduleKey);
    const normalizedRoute = (route ?? module?.route ?? "").split("?")[0].split("#")[0].trim();
    const routeMatches =
      !!module &&
      (!normalizedRoute ||
        normalizedRoute === module.route ||
        module.navigation.some((item) => {
          const candidate = item.route.split("?")[0].split("#")[0].trim();
          return candidate === normalizedRoute || normalizedRoute.startsWith(`${candidate}/`);
        }));

    // Module role membership is a hard boundary. A custom permission cannot
    // grant a user access to a module their role is not allowed to use.
    const roleAllowed = !module?.roles?.length || (userRole ? module.roles.includes(userRole as any) : false);

    if (
      !module ||
      !hasModule(moduleKey) ||
      !routeMatches ||
      !roleAllowed ||
      (permission && !hasPermission(permission))
    ) {
      return <AccessDenied />;
    }
    return <>{children}</>;
  }

  if (permission) {
    if (permLoading) return <PageLoader />;
    if (!hasPermission(permission)) return <AccessDenied />;
  }
  return <>{children}</>;
}
