import { createFileRoute } from "@tanstack/react-router";
import CmsHowItWorks from "@/pages/super-admin/cms/CmsHowItWorks";

export const Route = createFileRoute("/_super/super-admin/cms/how-it-works")({
  component: CmsHowItWorks,
});
