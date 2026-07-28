import { createFileRoute } from "@tanstack/react-router";
import CmsFaq from "@/pages/super-admin/cms/CmsFaq";

export const Route = createFileRoute("/_super/super-admin/cms/faq")({
  component: CmsFaq,
});
