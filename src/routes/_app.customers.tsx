import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/routing/helpers";
import Customers from "@/pages/Customers";

export const Route = createFileRoute("/_app/customers")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="customers.view"><Customers /></PermissionGuard>
  );
}
