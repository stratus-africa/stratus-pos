import { createFileRoute } from "@tanstack/react-router";
import SuperAdminActivity from "@/pages/super-admin/SuperAdminActivity";

export const Route = createFileRoute("/_super/super-admin/activity")({
  component: SuperAdminActivity,
});
