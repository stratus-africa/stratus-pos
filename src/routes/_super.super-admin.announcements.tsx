import { createFileRoute } from "@tanstack/react-router";
import SuperAdminAnnouncements from "@/pages/super-admin/SuperAdminAnnouncements";

export const Route = createFileRoute("/_super/super-admin/announcements")({
  component: SuperAdminAnnouncements,
});
