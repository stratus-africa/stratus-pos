import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { PermissionGuard } from "@/components/routing/helpers";
import Sales from "@/pages/Sales";

export const Route = createFileRoute("/_app/sales")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard moduleKey="sales" route="/sales" permission="sales.view">
      <FeatureGate moduleKey="sales">
        <RouteErrorBoundary title="Transactions" resetKey="/sales">
          <Sales />
        </RouteErrorBoundary>
      </FeatureGate>
    </PermissionGuard>
  );
}
