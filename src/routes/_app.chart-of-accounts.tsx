import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import ChartOfAccounts from "@/pages/ChartOfAccounts";

export const Route = createFileRoute("/_app/chart-of-accounts")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard moduleKey="accounting" route="/chart-of-accounts" permission="chart_of_accounts.view">
      <FeatureGate moduleKey="chart_of_accounts">
        <ChartOfAccounts />
      </FeatureGate>
    </PermissionGuard>
  );
}
