import { createFileRoute } from "@tanstack/react-router";
import SuperAdminDashboard from "@/pages/super-admin/SuperAdminDashboard";

export const Route = createFileRoute("/_super/super-admin/")({
  component: SuperAdminDashboard,
});
