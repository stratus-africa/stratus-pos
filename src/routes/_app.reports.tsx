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
    hasPermission("reports.sales") ||
    hasPermission("reports.purchases") ||
    hasPermission("reports.expenses") ||
    hasPermission("reports.stock") ||
    hasPermission("reports.profit_loss") ||
    hasPermission("reports.general_ledger") ||
    hasPermission("reports.trial_balance") ||
    hasPermission("reports.balance_sheet") ||
    hasPermission("reports.cash_flow") ||
    hasPermission("reports.audit");

  if (!canAnyReport) return <AccessDenied />;

  return (
    <FeatureGate moduleKey="reports">
      <Reports />
    </FeatureGate>
  );
}
