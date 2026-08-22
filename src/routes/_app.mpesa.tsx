import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import MpesaModule from "@/pages/MpesaModule";

export const Route = createFileRoute("/_app/mpesa")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="mpesa.view">
      <FeatureGate moduleKey="mpesa">
        <MpesaModule />
      </FeatureGate>
    </PermissionGuard>
  );
}
