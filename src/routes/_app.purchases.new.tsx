import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import PurchaseEditor from "@/pages/PurchaseEditor";

export const Route = createFileRoute("/_app/purchases/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="purchases.create"><FeatureGate moduleKey="purchases"><PurchaseEditor /></FeatureGate></PermissionGuard>
  );
}
