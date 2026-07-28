import { createFileRoute } from "@tanstack/react-router";
import Refund from "@/pages/legal/Refund";

export const Route = createFileRoute("/refund-policy")({
  component: Refund,
});
