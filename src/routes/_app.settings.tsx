import { createFileRoute } from "@tanstack/react-router";
import { PermissionGuard } from "@/components/routing/helpers";
import SettingsPage from "@/pages/SettingsPage";

export const Route = createFileRoute("/_app/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="settings.view"><SettingsPage /></PermissionGuard>
  );
}
