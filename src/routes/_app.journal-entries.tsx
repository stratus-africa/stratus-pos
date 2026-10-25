import { createFileRoute } from "@tanstack/react-router";
import { FeatureGate } from "@/components/FeatureGate";
import { PermissionGuard } from "@/components/routing/helpers";
import JournalEntries from "@/pages/JournalEntries";

export const Route = createFileRoute("/_app/journal-entries")({
  component: RouteComponent,
  head: () => ({ meta: [
    { title: "Accounting & VAT Journals | Stratus POS" },
    { name: "description", content: "Manage invoice VAT journals, accounting approvals and ledger postings in Stratus POS." },
    { property: "og:title", content: "Accounting & VAT Journals | Stratus POS" },
    { property: "og:description", content: "Manage invoice VAT journals, accounting approvals and ledger postings in Stratus POS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function RouteComponent() {
  return (
    <PermissionGuard permission="chart_of_accounts.view"><FeatureGate moduleKey="chart_of_accounts"><JournalEntries /></FeatureGate></PermissionGuard>
  );
}
