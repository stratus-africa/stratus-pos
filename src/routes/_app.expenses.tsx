import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Expenses from "@/pages/Expenses";

export const Route = createFileRoute("/_app/expenses")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard moduleKey="expenses" route="/expenses" permission="expenses.view">
      <FeatureGate moduleKey="expenses">
        <Expenses />
      </FeatureGate>
    </PermissionGuard>
  );
}
