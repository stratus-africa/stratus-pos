import { createFileRoute } from "@tanstack/react-router";
import SuperAdminTenantApprovals from "@/pages/super-admin/SuperAdminTenantApprovals";

export const Route = createFileRoute("/_super/super-admin/tenant-approvals")({
  component: SuperAdminTenantApprovals,
});
