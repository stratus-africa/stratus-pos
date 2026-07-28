import { createFileRoute } from "@tanstack/react-router";
import NotificationsPage from "@/pages/Notifications";

export const Route = createFileRoute("/_app/notifications")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <NotificationsPage />
  );
}
