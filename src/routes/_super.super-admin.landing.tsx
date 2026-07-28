import { createFileRoute } from "@tanstack/react-router";
import SuperAdminLanding from "@/pages/super-admin/SuperAdminLanding";

export const Route = createFileRoute("/_super/super-admin/landing")({
  component: SuperAdminLanding,
});
