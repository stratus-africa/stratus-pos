import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { SuperAdminLayout } from "@/components/super-admin/SuperAdminLayout";
import { PageLoader } from "@/components/routing/helpers";

export const Route = createFileRoute("/_super")({
  component: SuperAdminShell,
});

// Ported from the pre-migration SuperAdminRoutes wrapper in App.tsx.
function SuperAdminShell() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  if (authLoading || saLoading) return <PageLoader />;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <SuperAdminLayout>
      <Outlet />
    </SuperAdminLayout>
  );
}
