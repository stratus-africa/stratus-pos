import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Bell, X, FileText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReminderState {
  unpaidPurchases: number;
  unpaidAmount: number;
  unpostedExpenses: number;
}

export function ReminderBanner() {
  const { business } = useBusiness();
  const [state, setState] = useState<ReminderState>({ unpaidPurchases: 0, unpaidAmount: 0, unpostedExpenses: 0 });
  const [dismissed, setDismissed] = useState(false);

  const wantsPurchases = (business as { reminders_unpaid_purchases?: boolean })?.reminders_unpaid_purchases ?? false;
  const wantsExpenses = (business as { reminders_unposted_expenses?: boolean })?.reminders_unposted_expenses ?? false;

  const dismissKey = business ? `reminders_dismissed_${business.id}_${new Date().toISOString().slice(0, 10)}` : "";

  useEffect(() => {
    if (!business) return;
    if (dismissKey && localStorage.getItem(dismissKey)) { setDismissed(true); return; }
    if (!wantsPurchases && !wantsExpenses) return;
    (async () => {
      let unpaidPurchases = 0, unpaidAmount = 0, unpostedExpenses = 0;
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
        const since = new Date(); since.setDate(since.getDate() - 30);
        const { count } = await supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .is("category_id", null)
          .gte("date", since.toISOString().slice(0, 10));
        unpostedExpenses = count ?? 0;
      }
      setState({ unpaidPurchases, unpaidAmount, unpostedExpenses });
    })();
  }, [business?.id, wantsPurchases, wantsExpenses, dismissKey]);

  if (dismissed) return null;
  if (!wantsPurchases && !wantsExpenses) return null;
  if (state.unpaidPurchases === 0 && state.unpostedExpenses === 0) return null;

  const dismiss = () => { if (dismissKey) localStorage.setItem(dismissKey, "1"); setDismissed(true); };

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <Bell className="h-5 w-5 text-warning shrink-0" />
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
            <span><strong>{state.unpostedExpenses}</strong> uncategorised expense{state.unpostedExpenses > 1 ? "s" : ""} in last 30 days</span>
          </Link>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Dismiss reminders">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
