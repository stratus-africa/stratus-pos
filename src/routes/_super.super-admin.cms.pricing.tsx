import { createFileRoute } from "@tanstack/react-router";
import CmsPricing from "@/pages/super-admin/cms/CmsPricing";

export const Route = createFileRoute("/_super/super-admin/cms/pricing")({
  component: CmsPricing,
});
