import { createFileRoute } from "@tanstack/react-router";
import HR from "@/pages/HR";

export const Route = createFileRoute("/_app/hr")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <HR />
  );
}
