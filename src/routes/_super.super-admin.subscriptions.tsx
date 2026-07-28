import { createFileRoute } from "@tanstack/react-router";
import SuperAdminSubscriptions from "@/pages/super-admin/SuperAdminSubscriptions";

export const Route = createFileRoute("/_super/super-admin/subscriptions")({
  component: SuperAdminSubscriptions,
});
