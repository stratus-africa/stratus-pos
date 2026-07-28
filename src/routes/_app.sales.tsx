import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Sales from "@/pages/Sales";

export const Route = createFileRoute("/_app/sales")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="sales.view"><FeatureGate featureKey="sales"><Sales /></FeatureGate></PermissionGuard>
  );
}
