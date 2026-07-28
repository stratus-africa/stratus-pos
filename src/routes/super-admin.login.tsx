import { createFileRoute } from "@tanstack/react-router";
import SuperAdminLogin from "@/pages/SuperAdminLogin";

export const Route = createFileRoute("/super-admin/login")({
  component: SuperAdminLogin,
});
