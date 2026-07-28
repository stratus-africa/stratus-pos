import { createFileRoute } from "@tanstack/react-router";
import SuperAdminPaymentsOverview from "@/pages/super-admin/SuperAdminPaymentsOverview";

export const Route = createFileRoute("/_super/super-admin/payments")({
  component: SuperAdminPaymentsOverview,
});
