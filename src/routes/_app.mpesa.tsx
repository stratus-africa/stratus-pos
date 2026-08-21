import { createFileRoute } from "@tanstack/react-router";
import MpesaModule from "@/pages/MpesaModule";

export const Route = createFileRoute("/_app/mpesa")({
  component: MpesaModule,
});
