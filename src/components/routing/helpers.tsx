import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

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
  children,
}: {
  permission?: string;
  children: ReactNode;
}) {
  const { hasPermission, isLoading } = usePermissions();
  if (permission) {
    if (isLoading) return <PageLoader />;
    if (!hasPermission(permission)) return <AccessDenied />;
  }
  return <>{children}</>;
}
