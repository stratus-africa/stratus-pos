import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Banking from "@/pages/Banking";

export const Route = createFileRoute("/_app/banking")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="banking.view"><FeatureGate featureKey="banking"><Banking /></FeatureGate></PermissionGuard>
  );
}
