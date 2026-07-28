import { createFileRoute } from "@tanstack/react-router";
import SuperAdminBusinesses from "@/pages/super-admin/SuperAdminBusinesses";

export const Route = createFileRoute("/_super/super-admin/businesses/")({
  component: SuperAdminBusinesses,
});
