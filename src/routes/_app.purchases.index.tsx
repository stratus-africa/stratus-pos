import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Purchases from "@/pages/Purchases";

export const Route = createFileRoute("/_app/purchases/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="purchases.view"><FeatureGate featureKey="purchases"><Purchases /></FeatureGate></PermissionGuard>
  );
}
