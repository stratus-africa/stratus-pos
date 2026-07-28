import { createFileRoute } from "@tanstack/react-router";
import SuperAdminModules from "@/pages/super-admin/SuperAdminModules";

export const Route = createFileRoute("/_super/super-admin/modules")({
  component: SuperAdminModules,
});
