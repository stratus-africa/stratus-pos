import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Bell, X, FileText, Receipt, Check, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PendingAdjustment {
  id: string;
  reason: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  locations?: { name: string } | null;
  stock_adjustments?: { quantity_change: number; products?: { name: string } | null }[];
}

interface ReminderState {
  unpaidPurchases: number;
  unpaidAmount: number;
  unpostedExpenses: number;
  pendingAdjustments: PendingAdjustment[];
}

export function ReminderBanner() {
  const { business } = useBusiness();
  const { hasPermission } = usePermissions();
  const canApproveAdjustments = hasPermission("inventory.approve_adjustment");
  const [state, setState] = useState<ReminderState>({
    unpaidPurchases: 0,
    unpaidAmount: 0,
    unpostedExpenses: 0,
    pendingAdjustments: [],
  });
  const [dismissed, setDismissed] = useState(false);

  const wantsPurchases = (business as { reminders_unpaid_purchases?: boolean })?.reminders_unpaid_purchases ?? false;
  const wantsExpenses = (business as { reminders_unposted_expenses?: boolean })?.reminders_unposted_expenses ?? false;

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
        unpostedExpenses = 0;
      let pendingAdjustments: PendingAdjustment[] = [];
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
          .select(
            "id,reason,reference,notes,created_at,locations(name),stock_adjustments(quantity_change,products(name))",
          )
          .eq("status", "pending")
          .in("reason", ["Issue", "Write-off", "Adjustment"])
          .order("created_at", { ascending: false });
        pendingAdjustments = (data ?? []) as unknown as PendingAdjustment[];
      }
      setState({ unpaidPurchases, unpaidAmount, unpostedExpenses, pendingAdjustments });
    })();
  }, [business?.id, wantsPurchases, wantsExpenses, canApproveAdjustments, dismissKey]);

  if (dismissed) return null;
  if (!wantsPurchases && !wantsExpenses && !canApproveAdjustments) return null;
  if (state.unpaidPurchases === 0 && state.unpostedExpenses === 0 && state.pendingAdjustments.length === 0) return null;

  const dismiss = () => {
    if (dismissKey) localStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  const unpaidTone =
    state.unpaidAmount > 30000
      ? "border-red-300 bg-red-50 text-red-950"
      : "border-orange-300 bg-orange-50 text-orange-950";

  const reviewAdjustment = async (id: string, approve: boolean) => {
    const result = approve
      ? await supabase.rpc("approve_inventory_control_request" as any, { _document_id: id })
      : await supabase.rpc("reject_inventory_control_request" as any, {
          _document_id: id,
          _reason: "Rejected by approver",
        });
    if (result.error) {
      toast.error(result.error.message || "Could not review stock adjustment");
      return;
    }
    toast.success(approve ? "Stock adjustment approved" : "Stock adjustment rejected");
    setState((prev) => ({
      ...prev,
      pendingAdjustments: prev.pendingAdjustments.filter((item) => item.id !== id),
    }));
  };

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
        {canApproveAdjustments && state.pendingAdjustments.length > 0 && (
          <div className="w-full space-y-2 border-t border-current/10 pt-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <strong>{state.pendingAdjustments.length}</strong> stock adjustment approval
              {state.pendingAdjustments.length > 1 ? "s" : ""} pending
            </div>
            {state.pendingAdjustments.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex flex-col md:flex-row md:items-center gap-2 rounded-lg border border-current/10 bg-white/60 p-2.5"
              >
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{item.reason}</span>
                    <span className="text-current/60">{item.locations?.name || "—"}</span>
                  </div>
                  <div className="truncate text-current/70">
                    {item.reference || "No reference"} ·{" "}
                    {(item.stock_adjustments ?? [])
                      .map((line) => `${line.products?.name || "Product"}: ${Math.abs(Number(line.quantity_change))}`)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" className="h-8" onClick={() => void reviewAdjustment(item.id, true)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => void reviewAdjustment(item.id, false)}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
            {state.pendingAdjustments.length > 5 && (
              <Link to="/inventory?tab=adjustments" className="text-xs font-medium hover:underline">
                View all pending adjustments →
              </Link>
            )}
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Dismiss reminders">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
