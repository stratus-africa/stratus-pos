import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import POS from "@/pages/POS";

export const Route = createFileRoute("/_app/pos")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="pos.view"><FeatureGate moduleKey="pos"><POS /></FeatureGate></PermissionGuard>
  );
}
