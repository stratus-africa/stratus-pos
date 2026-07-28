import { createFileRoute } from "@tanstack/react-router";
import SuperAdminPackageEdit from "@/pages/super-admin/SuperAdminPackageEdit";

export const Route = createFileRoute("/_super/super-admin/packages/$id/edit")({
  component: SuperAdminPackageEdit,
});
