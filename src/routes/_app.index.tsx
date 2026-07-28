import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import { useBusiness } from "@/contexts/BusinessContext";
import CashierDashboard from "@/pages/CashierDashboard";
import Index from "@/pages/Index";
import StoresManagerDashboard from "@/pages/StoresManagerDashboard";

export const Route = createFileRoute("/_app/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { userRole } = useBusiness();

  if (userRole === "cashier") return <CashierDashboard />;
  if (userRole === "stores_manager") return <StoresManagerDashboard />;

  return (
    <PermissionGuard permission="dashboard.view">
      <FeatureGate featureKey="dashboard">
        <Index />
      </FeatureGate>
    </PermissionGuard>
  );
}
