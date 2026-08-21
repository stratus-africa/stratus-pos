import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useEntitlement } from "@/hooks/useEntitlement";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Settings2, Smartphone, Search, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { toast } from "sonner";

interface MpesaRow {
  id: string;
  sale_id: string | null;
  phone_number: string;
  amount: number;
  status: string;
  mpesa_receipt_number: string | null;
  checkout_request_id: string | null;
  result_description: string | null;
  created_at: string;
}

const statusMeta: Record<string, { label: string; icon: typeof CheckCircle2; variant: "default" | "secondary" | "destructive" }> = {
  completed: { label: "Completed", icon: CheckCircle2, variant: "default" },
  pending: { label: "Pending", icon: Clock3, variant: "secondary" },
  failed: { label: "Failed", icon: XCircle, variant: "destructive" },
  cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
};

export default function MpesaModule() {
  const { business } = useBusiness();
  const { hasFeature, hasModule, isLoading: entitlementLoading } = useEntitlement();
  const [rows, setRows] = useState<MpesaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const canView = hasModule("mpesa") && hasFeature("mpesa", "view");
  const canConfigure = hasFeature("mpesa", "settings");

  const load = async () => {
    if (!business?.id || !canView) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("mpesa_transactions")
      .select("id,sale_id,phone_number,amount,status,mpesa_receipt_number,checkout_request_id,result_description,created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data as MpesaRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [business?.id, canView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.phone_number, r.mpesa_receipt_number || "", r.sale_id || "", r.status].join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  if (entitlementLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!canView) return <div className="p-6"><Card><CardContent className="py-12 text-center"><Smartphone className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">M-Pesa is not included in your plan</h2><p className="mt-1 text-sm text-muted-foreground">Ask your administrator to enable the M-Pesa premium module.</p></CardContent></Card></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Smartphone className="h-6 w-6" /><h1 className="text-2xl font-bold">M-Pesa</h1></div>
          <p className="text-sm text-muted-foreground">STK Push payments, receipts and reconciliation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          {canConfigure && <Button asChild><Link to="/settings"><Settings2 className="mr-2 h-4 w-4" />M-Pesa Settings</Link></Button>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Completed</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{rows.filter(r => r.status === "completed").length}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pending</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{rows.filter(r => r.status === "pending").length}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Completed Value</CardTitle></CardHeader><CardContent className="text-2xl font-bold">KES {rows.filter(r => r.status === "completed").reduce((s,r) => s + Number(r.amount || 0), 0).toLocaleString()}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>M-Pesa Transactions</CardTitle><div className="relative w-full sm:w-80"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search phone, receipt or sale" className="pl-9" /></div></div></CardHeader>
        <CardContent>
          {loading ? <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : filtered.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No M-Pesa transactions found.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{filtered.map(r => { const meta = statusMeta[r.status] || statusMeta.pending; const Icon = meta.icon; return <tr key={r.id} className="border-b last:border-0"><td className="px-3 py-3">{new Date(r.created_at).toLocaleString("en-KE")}</td><td className="px-3 py-3 font-medium">{r.phone_number}</td><td className="px-3 py-3">KES {Number(r.amount).toLocaleString()}</td><td className="px-3 py-3 font-mono text-xs">{r.mpesa_receipt_number || "—"}</td><td className="px-3 py-3"><Badge variant={meta.variant}><Icon className="mr-1 h-3 w-3" />{meta.label}</Badge></td></tr>; })}</tbody></table></div>}
        </CardContent>
      </Card>
    </div>
  );
}
