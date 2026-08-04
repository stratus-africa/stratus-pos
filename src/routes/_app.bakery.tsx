import { createFileRoute } from "@tanstack/react-router";
import Bakery from "@/pages/Bakery";

export const Route = createFileRoute("/_app/bakery")({ component: Bakery });
