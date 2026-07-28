import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Suppliers from "@/pages/Suppliers";

export const Route = createFileRoute("/_app/suppliers")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="suppliers.view"><FeatureGate featureKey="purchases"><Suppliers /></FeatureGate></PermissionGuard>
  );
}
