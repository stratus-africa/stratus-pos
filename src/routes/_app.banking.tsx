import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Banking from "@/pages/Banking";

export const Route = createFileRoute("/_app/banking")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard moduleKey="banking" route="/banking" permission="banking.view">
      <FeatureGate moduleKey="banking">
        <Banking />
      </FeatureGate>
    </PermissionGuard>
  );
}
