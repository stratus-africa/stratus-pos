import { createFileRoute } from "@tanstack/react-router";
import PublicInvoice from "@/pages/PublicInvoice";

export const Route = createFileRoute("/invoice/$id")({
  component: PublicInvoice,
});
