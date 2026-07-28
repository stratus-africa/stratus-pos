import { createFileRoute } from "@tanstack/react-router";
import SuperAdminSettings from "@/pages/super-admin/SuperAdminSettings";

export const Route = createFileRoute("/_super/super-admin/settings/")({
  component: SuperAdminSettings,
});
