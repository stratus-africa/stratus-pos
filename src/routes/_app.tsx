import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { AppLayout } from "@/components/AppLayout";
import { PageLoader } from "@/components/routing/helpers";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

// Ported from the pre-migration ProtectedRoutes wrapper in App.tsx.
function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const { needsOnboarding, loading: bizLoading } = useBusiness();

  if (authLoading || bizLoading) return <PageLoader />;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
