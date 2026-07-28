import { createFileRoute } from "@tanstack/react-router";
import MpesaSettings from "@/pages/super-admin/payments/MpesaSettings";

export const Route = createFileRoute("/_super/super-admin/settings/payments/mpesa")({
  component: MpesaSettings,
});
