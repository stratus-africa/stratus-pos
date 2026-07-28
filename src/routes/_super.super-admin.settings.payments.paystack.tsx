import { createFileRoute } from "@tanstack/react-router";
import PaystackSettings from "@/pages/super-admin/payments/PaystackSettings";

export const Route = createFileRoute("/_super/super-admin/settings/payments/paystack")({
  component: PaystackSettings,
});
