import { createFileRoute } from "@tanstack/react-router";
import SuperAdminBusinessEdit from "@/pages/super-admin/SuperAdminBusinessEdit";

export const Route = createFileRoute("/_super/super-admin/businesses/$id/edit")({
  component: SuperAdminBusinessEdit,
});
