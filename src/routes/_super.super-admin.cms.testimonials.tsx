import { createFileRoute } from "@tanstack/react-router";
import CmsTestimonials from "@/pages/super-admin/cms/CmsTestimonials";

export const Route = createFileRoute("/_super/super-admin/cms/testimonials")({
  component: CmsTestimonials,
});
