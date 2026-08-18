import { createFileRoute } from "@tanstack/react-router";
import SuperAdminModuleManager from "@/pages/super-admin/SuperAdminModuleManager";

export const Route = createFileRoute("/_super/super-admin/modules")({
  component: SuperAdminModuleManager,
});
