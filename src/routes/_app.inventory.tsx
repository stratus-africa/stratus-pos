import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Inventory from "@/pages/Inventory";

export const Route = createFileRoute("/_app/inventory")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard moduleKey="inventory" route="/inventory" permission="inventory.view">
      <FeatureGate featureKey="inventory">
        <Inventory />
      </FeatureGate>
    </PermissionGuard>
  );
}
