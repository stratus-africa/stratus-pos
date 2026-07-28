import { createFileRoute } from "@tanstack/react-router";
import CmsCta from "@/pages/super-admin/cms/CmsCta";

export const Route = createFileRoute("/_super/super-admin/cms/cta")({
  component: CmsCta,
});
