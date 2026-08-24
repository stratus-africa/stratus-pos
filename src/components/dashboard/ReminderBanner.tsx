import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Bell, X, FileText, Receipt, AlertTriangle, Check, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReminderState {
  unpaidPurchases: number;
  unpaidAmount: number;
  unpostedExpenses: number;
  adjustmentApprovals: any[];
}

export function ReminderBanner() {
  const { business } = useBusiness();
  const { hasPermission } = usePermissions();
  const [state, setState] = useState<ReminderState>({
    unpaidPurchases: 0,
    unpaidAmount: 0,
    unpostedExpenses: 0,
    adjustmentApprovals: [],
  });
  const [dismissed, setDismissed] = useState(false);

  const wantsPurchases = (business as { reminders_unpaid_purchases?: boolean })?.reminders_unpaid_purchases ?? false;
  const wantsExpenses = (business as { reminders_unposted_expenses?: boolean })?.reminders_unposted_expenses ?? false;
  const canApproveAdjustments = hasPermission("inventory.approve_adjustment");

  const dismissKey = business ? `reminders_dismissed_${business.id}_${new Date().toISOString().slice(0, 10)}` : "";

  useEffect(() => {
    if (!business) return;
    if (dismissKey && localStorage.getItem(dismissKey)) {
      setDismissed(true);
      return;
    }
    if (!wantsPurchases && !wantsExpenses && !canApproveAdjustments) return;
    (async () => {
      let unpaidPurchases = 0,
        unpaidAmount = 0,
        unpostedExpenses = 0,
        adjustmentApprovals: any[] = [];
      if (wantsPurchases) {
        const { data } = await supabase
          .from("purchases")
          .select("total, payment_status")
          .eq("business_id", business.id)
          .in("payment_status", ["unpaid", "partial"]);
        unpaidPurchases = data?.length ?? 0;
        unpaidAmount = (data ?? []).reduce((sum, r: { total: number }) => sum + Number(r.total || 0), 0);
      }
      if (wantsExpenses) {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { count } = await supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .is("category_id", null)
          .gte("date", since.toISOString().slice(0, 10));
        unpostedExpenses = count ?? 0;
      }
      if (canApproveAdjustments) {
        const { data } = await supabase
          .from("stock_adjustment_documents" as any)
          .select("id,reason,reference,notes,status,created_at")
          .eq("business_id", business.id)
          .eq("status", "pending")
          .in("reason", ["Issue", "Write-off", "Adjustment"])
          .order("created_at", { ascending: false });
        adjustmentApprovals = data ?? [];
      }
      setState({ unpaidPurchases, unpaidAmount, unpostedExpenses, adjustmentApprovals });
    })();
  }, [business?.id, wantsPurchases, wantsExpenses, canApproveAdjustments, dismissKey]);

  if (dismissed) return null;
  if (!wantsPurchases && !wantsExpenses && state.adjustmentApprovals.length === 0) return null;
  if (state.unpaidPurchases === 0 && state.unpostedExpenses === 0 && state.adjustmentApprovals.length === 0)
    return null;

  const dismiss = () => {
    if (dismissKey) localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  const unpaidTone =
    state.unpaidAmount > 30000
      ? "border-red-300 bg-red-50 text-red-950"
      : "border-orange-300 bg-orange-50 text-orange-950";

  return (
    <div className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${unpaidTone}`}>
      <Bell className={`h-5 w-5 shrink-0 ${state.unpaidAmount > 30000 ? "text-red-600" : "text-orange-600"}`} />
      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 flex-wrap">
        {wantsPurchases && state.unpaidPurchases > 0 && (
          <Link to="/purchases" className="flex items-center gap-2 text-sm hover:underline">
            <FileText className="h-4 w-4" />
            <span>
              <strong>{state.unpaidPurchases}</strong> unpaid purchase{state.unpaidPurchases > 1 ? "s" : ""}
              {state.unpaidAmount > 0 && ` — KES ${state.unpaidAmount.toLocaleString()}`}
            </span>
          </Link>
        )}
        {wantsExpenses && state.unpostedExpenses > 0 && (
          <Link to="/expenses" className="flex items-center gap-2 text-sm hover:underline">
            <Receipt className="h-4 w-4" />
            <span>
              <strong>{state.unpostedExpenses}</strong> uncategorised expense{state.unpostedExpenses > 1 ? "s" : ""} in
              last 30 days
            </span>
          </Link>
        )}
        {state.adjustmentApprovals.length > 0 && (
          <div className="w-full space-y-2 pt-1">
            {state.adjustmentApprovals.slice(0, 5).map((request: any) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-white/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="font-medium">{request.reason}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{request.reference || "No reference"}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={async () => {
                      const { error } = await supabase.rpc("approve_inventory_control_request" as any, {
                        _document_id: request.id,
                      });
                      if (error) toast.error(error.message);
                      else {
                        toast.success("Adjustment request approved");
                        setState((prev) => ({
                          ...prev,
                          adjustmentApprovals: prev.adjustmentApprovals.filter((r: any) => r.id !== request.id),
                        }));
                      }
                    }}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const { error } = await supabase.rpc("reject_inventory_control_request" as any, {
                        _document_id: request.id,
                        _reason: "Rejected by approver",
                      });
                      if (error) toast.error(error.message);
                      else {
                        toast.success("Adjustment request rejected");
                        setState((prev) => ({
                          ...prev,
                          adjustmentApprovals: prev.adjustmentApprovals.filter((r: any) => r.id !== request.id),
                        }));
                      }
                    }}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Dismiss reminders">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
