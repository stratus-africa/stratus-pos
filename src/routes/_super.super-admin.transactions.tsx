import { createFileRoute } from "@tanstack/react-router";
import SuperAdminTransactions from "@/pages/super-admin/SuperAdminTransactions";

export const Route = createFileRoute("/_super/super-admin/transactions")({
  component: SuperAdminTransactions,
});
