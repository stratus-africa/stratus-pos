import { createFileRoute } from "@tanstack/react-router";
import CmsHero from "@/pages/super-admin/cms/CmsHero";

export const Route = createFileRoute("/_super/super-admin/cms/hero")({
  component: CmsHero,
});
