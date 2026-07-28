import { createFileRoute } from "@tanstack/react-router";
import SuperAdminTenantDetail from "@/pages/super-admin/SuperAdminTenantDetail";

export const Route = createFileRoute("/_super/super-admin/businesses/$id/")({
  component: SuperAdminTenantDetail,
});
