import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_super/super-admin/modules")({
  beforeLoad: () => {
    throw redirect({ to: "/super-admin/packages", replace: true });
  },
});
