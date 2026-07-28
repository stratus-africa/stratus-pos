import { createFileRoute } from "@tanstack/react-router";
import CmsFeatures from "@/pages/super-admin/cms/CmsFeatures";

export const Route = createFileRoute("/_super/super-admin/cms/features")({
  component: CmsFeatures,
});
