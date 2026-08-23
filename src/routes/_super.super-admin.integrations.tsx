import { createFileRoute } from "@tanstack/react-router";
import SuperAdminIntegrations from "@/pages/super-admin/SuperAdminIntegrations";

export const Route = createFileRoute("/_super/super-admin/integrations")({
  component: SuperAdminIntegrations,
});
