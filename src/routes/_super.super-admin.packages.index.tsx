import { createFileRoute } from "@tanstack/react-router";
import SuperAdminPackages from "@/pages/super-admin/SuperAdminPackages";

export const Route = createFileRoute("/_super/super-admin/packages/")({
  component: SuperAdminPackages,
});
