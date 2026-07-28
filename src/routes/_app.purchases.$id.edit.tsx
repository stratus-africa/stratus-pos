import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import PurchaseEditor from "@/pages/PurchaseEditor";

export const Route = createFileRoute("/_app/purchases/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="purchases.edit"><FeatureGate featureKey="purchases"><PurchaseEditor /></FeatureGate></PermissionGuard>
  );
}
