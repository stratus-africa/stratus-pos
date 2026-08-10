import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

type Props = { from: string; to: string; onRegisterExport?: (fn: (() => void) | null) => void };
type Row = any;

export default function MpesaReconciliationReportTab({ from, to, onRegisterExport }: Props) {
  const { business } = useBusiness();
  const report = useQuery({
    queryKey: ["mpesa-reconciliation", business?.id, from, to],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await supabase.from("mpesa_transactions")
        .select("id,created_at,updated_at,amount,status,type,checkout_request_id,merchant_request_id,mpesa_receipt_number,result_code,result_description,transaction_date,phone_number,sale_id,sales(id,invoice_number,total,status,payment_status,payments(id,amount,method,reference))")
        .eq("business_id", business!.id).gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });
  const rows = report.data || [];
  const flagged = useMemo(() => rows.map((row) => {
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    const payments = sale?.payments || [];
    const matchingPayment = payments.find((p: any) => p.method === "mpesa" && p.reference === row.mpesa_receipt_number);
    const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
    let issue = "";
    if (row.status === "pending" && ageMinutes > 10) issue = "Missing callback / stale pending";
    else if (row.status === "completed" && !sale) issue = "Completed M-PESA has no sale";
    else if (row.status === "completed" && !matchingPayment && sale?.payment_status !== "paid") issue = "Receipt missing from payments";
    else if (row.status === "completed" && sale && Number(row.amount) > Number(sale.total) + 0.01) issue = "Transaction exceeds sale total";
    else if ((row.status === "failed" || row.status === "cancelled") && sale?.payment_status === "paid") issue = "Sale paid despite failed callback";
    return { ...row, sale, issue };
  }), [rows]);
  const mismatches = flagged.filter((r) => r.issue);
  const exportCsv = () => {
    const header = ["Created", "Status", "Amount", "CheckoutRequestID", "Receipt", "Sale", "Sale payment status", "Issue"];
    const body = flagged.map((r) => [r.created_at, r.status, r.amount, r.checkout_request_id || "", r.mpesa_receipt_number || "", r.sale?.invoice_number || "", r.sale?.payment_status || "", r.issue || "OK"]);
    const csv = [header, ...body].map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = `mpesa-reconciliation-${from}-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  useEffect(() => {
    onRegisterExport?.(exportCsv);
    return () => onRegisterExport?.(null);
  }, [onRegisterExport, from, to, flagged]);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Transactions</p><p className="text-2xl font-bold">{rows.length}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-bold text-emerald-600">{rows.filter((r) => r.status === "completed").length}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Mismatches</p><p className="text-2xl font-bold text-destructive">{mismatches.length}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Amount processed</p><p className="text-2xl font-bold">KES {rows.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString()}</p></CardContent></Card></div>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">M-PESA vs sales/payments</CardTitle><Button size="sm" variant="outline" onClick={() => report.refetch()}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button></CardHeader><CardContent>{report.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Status</th><th className="p-2">Amount</th><th className="p-2">Sale</th><th className="p-2">Receipt</th><th className="p-2">Reconciliation</th></tr></thead><tbody>{flagged.map((r) => <tr key={r.id} className="border-b"><td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td><td className="p-2"><Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge></td><td className="p-2">KES {Number(r.amount).toLocaleString()}</td><td className="p-2">{r.sale?.invoice_number || "—"}</td><td className="p-2 font-mono text-xs">{r.mpesa_receipt_number || "—"}</td><td className="p-2">{r.issue ? <span className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {r.issue}</span> : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Matched</span>}</td></tr>)}</tbody></table>{!flagged.length && <p className="py-8 text-center text-muted-foreground">No M-PESA transactions in this period.</p>}</div>}</CardContent></Card>
  </div>;
}
