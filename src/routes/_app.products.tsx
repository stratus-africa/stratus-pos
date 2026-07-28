import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import Products from "@/pages/Products";

export const Route = createFileRoute("/_app/products")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="products.view"><FeatureGate featureKey="products"><Products /></FeatureGate></PermissionGuard>
  );
}
