import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { AccessDenied, PageLoader } from "@/components/routing/helpers";
import { usePermissions } from "@/hooks/usePermissions";
import Reports from "@/pages/Reports";

export const Route = createFileRoute("/_app/reports")({
  component: RouteComponent,
});

function RouteComponent() {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) return <PageLoader />;

  const canAnyReport =
    hasPermission("report.sales") ||
    hasPermission("report.purchases") ||
    hasPermission("report.expenses") ||
    hasPermission("report.inventory") ||
    hasPermission("report.pnl") ||
    hasPermission("report.audit");

  if (!canAnyReport) return <AccessDenied />;

  return (
    <FeatureGate featureKey="reports">
      <Reports />
    </FeatureGate>
  );
}
