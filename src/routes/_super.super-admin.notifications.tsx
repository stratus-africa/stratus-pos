import { createFileRoute } from "@tanstack/react-router";
import NotificationsPage from "@/pages/Notifications";

export const Route = createFileRoute("/_super/super-admin/notifications")({
  component: NotificationsPage,
});
