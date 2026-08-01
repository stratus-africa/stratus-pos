import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import BarcodeMapping from "@/pages/BarcodeMapping";

export const Route = createFileRoute("/_app/barcode-mapping")({
  component: RouteComponent,
  head: () => ({
    meta: [
      { title: "Barcode Mapping | Stratus POS" },
      { name: "description", content: "Assign or update product barcodes so every POS scan resolves to the right item." },
      { property: "og:title", content: "Barcode Mapping | Stratus POS" },
      { property: "og:description", content: "Assign or update product barcodes so every POS scan resolves to the right item." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RouteComponent() {
  return (
    <PermissionGuard permission="products.edit">
      <FeatureGate featureKey="products"><BarcodeMapping /></FeatureGate>
    </PermissionGuard>
  );
}
