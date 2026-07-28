import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Digitax from "@/pages/Digitax";

export const Route = createFileRoute("/_app/tax-compliance")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="settings.view"><FeatureGate featureKey="digitax"><Digitax /></FeatureGate></PermissionGuard>
  );
}
