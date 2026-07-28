import { createFileRoute } from "@tanstack/react-router";
import SuperAdminUsers from "@/pages/super-admin/SuperAdminUsers";

export const Route = createFileRoute("/_super/super-admin/users")({
  component: SuperAdminUsers,
});
