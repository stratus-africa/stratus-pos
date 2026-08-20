import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Bakery from "@/pages/Bakery";

export const Route = createFileRoute("/_app/bakery")({ component: RouteComponent });

function RouteComponent() {
  return (
    <PermissionGuard moduleKey="bakery" route="/bakery" permission="bakery.view">
      <FeatureGate moduleKey="bakery">
        <Bakery />
      </FeatureGate>
    </PermissionGuard>
  );
}
