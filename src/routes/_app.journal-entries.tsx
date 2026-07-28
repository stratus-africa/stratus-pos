import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import JournalEntries from "@/pages/JournalEntries";

export const Route = createFileRoute("/_app/journal-entries")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PermissionGuard permission="chart_of_accounts.view"><FeatureGate featureKey="chart_of_accounts"><JournalEntries /></FeatureGate></PermissionGuard>
  );
}
