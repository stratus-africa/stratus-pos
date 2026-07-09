import { useEffect, useState } from "react";
import { Bell, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

type OfflineReq = {
  id: string;
  business_id: string;
  package_id: string;
  billing_interval: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
};

export function NotificationBell() {
  const [items, setItems] = useState<OfflineReq[]>([]);
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await supabase
      .from("offline_payment_requests")
      .select("id,business_id,package_id,billing_interval,amount,currency,reference,status,created_at,reviewed_at")
      .order("created_at", { ascending: false })
      .limit(15);
    setItems((data as OfflineReq[]) || []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("offline-payment-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offline_payment_requests" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const pendingCount = items.filter((i) => i.status === "pending").length;

  const iconFor = (s: string) => {
    if (s === "approved") return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />;
    if (s === "rejected") return <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
    return <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-foreground/60 border border-border relative"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {pendingCount > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground">
              {pendingCount} pending
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => navigate("/super-admin/subscriptions")}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-start gap-2 border-b border-border/50 last:border-0"
              >
                {iconFor(it.status)}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    Offline payment {it.status}
                    {it.amount ? ` — ${it.currency || "KES"} ${Number(it.amount).toLocaleString()}` : ""}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {it.billing_interval} • Ref: {it.reference || "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(it.reviewed_at || it.created_at), { addSuffix: true })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
