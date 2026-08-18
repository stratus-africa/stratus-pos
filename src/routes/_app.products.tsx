import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Products from "@/pages/Products";

export const Route = createFileRoute("/_app/products")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard moduleKey="products" route="/products" permission="products.view">
      <FeatureGate moduleKey="products">
        <Products />
      </FeatureGate>
    </PermissionGuard>
  );
}
