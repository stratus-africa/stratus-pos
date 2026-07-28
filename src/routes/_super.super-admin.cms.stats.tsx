import { createFileRoute } from "@tanstack/react-router";
import CmsStats from "@/pages/super-admin/cms/CmsStats";

export const Route = createFileRoute("/_super/super-admin/cms/stats")({
  component: CmsStats,
});
