import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useEntitlement } from "@/hooks/useEntitlement";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Settings2,
  Smartphone,
  Search,
  CheckCircle2,
  Clock3,
  XCircle,
  Link2,
  Zap,
  MessageSquareText,
} from "lucide-react";
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

interface SmsRow {
  id: string;
  sender: string | null;
  sender_phone: string | null;
  message: string;
  mpesa_receipt_number: string | null;
  amount: number | null;
  payer_name: string | null;
  transaction_at: string | null;
  status: string;
  sale_id: string | null;
  mpesa_transaction_id: string | null;
  received_at: string;
}

interface SaleRow {
  id: string;
  invoice_number: string | null;
  total: number;
  payment_status: string;
  customer?: { name?: string | null; phone?: string | null } | null;
}

const statusMeta: Record<
  string,
  { label: string; icon: typeof CheckCircle2; variant: "default" | "secondary" | "destructive" }
> = {
  completed: { label: "Completed", icon: CheckCircle2, variant: "default" },
  pending: { label: "Pending", icon: Clock3, variant: "secondary" },
  failed: { label: "Failed", icon: XCircle, variant: "destructive" },
  cancelled: { label: "Cancelled", icon: XCircle, variant: "destructive" },
  amount_mismatch: { label: "Amount mismatch", icon: XCircle, variant: "destructive" },
};

export default function MpesaModule() {
  const { business } = useBusiness();
  const { hasFeature, hasModule, isLoading: entitlementLoading } = useEntitlement();
  const [tab, setTab] = useState<"transactions" | "sms" | "reconciliation">("transactions");
  const [rows, setRows] = useState<MpesaRow[]>([]);
  const [smsRows, setSmsRows] = useState<SmsRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [smsLoading, setSmsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [smsSearch, setSmsSearch] = useState("");
  const [matchOpen, setMatchOpen] = useState(false);
  const [selectedSms, setSelectedSms] = useState<SmsRow | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<MpesaRow | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [matching, setMatching] = useState(false);
  const [autoReconciling, setAutoReconciling] = useState(false);

  const canView = hasModule("mpesa") && hasFeature("mpesa", "view");
  const canViewTransactions = hasFeature("mpesa", "view_transactions");
  const canSms = hasFeature("mpesa", "sms_inbox");
  const canReconcile = hasFeature("mpesa", "reconcile");
  const canManualMatch = hasFeature("mpesa", "manual_match");
  const canAutoReconcile = hasFeature("mpesa", "auto_reconcile");
  const canConfigure = hasFeature("mpesa", "settings");

  const loadTransactions = async () => {
    if (!business?.id || !canViewTransactions) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("mpesa_transactions")
      .select(
        "id,sale_id,phone_number,amount,status,mpesa_receipt_number,checkout_request_id,result_description,created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRows((data as MpesaRow[]) || []);
    setLoading(false);
  };

  const loadSms = async () => {
    if (!business?.id || !canSms) return;
    setSmsLoading(true);
    const { data, error } = await (supabase as any)
      .from("mpesa_incoming_sms")
      .select(
        "id,sender,sender_phone,message,mpesa_receipt_number,amount,payer_name,transaction_at,status,sale_id,mpesa_transaction_id,received_at",
      )
      .eq("business_id", business.id)
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setSmsRows((data as SmsRow[]) || []);
    setSmsLoading(false);
  };

  const loadSales = async () => {
    if (!business?.id || !canManualMatch) return;
    const { data, error } = await supabase
      .from("sales")
      .select("id,invoice_number,total,payment_status,customers(name,phone)")
      .eq("business_id", business.id)
      .neq("status", "cancelled")
      .in("payment_status", ["unpaid", "partial"])
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast.error(error.message);
    setSales((data as SaleRow[]) || []);
  };

  const refresh = async () => {
    await Promise.all([loadTransactions(), loadSms(), loadSales()]);
  };

  useEffect(() => {
    void refresh();
  }, [business?.id, canViewTransactions, canSms, canManualMatch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.phone_number, r.mpesa_receipt_number || "", r.sale_id || "", r.status].join(" ").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const filteredSms = useMemo(() => {
    const q = smsSearch.trim().toLowerCase();
    if (!q) return smsRows;
    return smsRows.filter((r) =>
      [
        r.sender || "",
        r.sender_phone || "",
        r.payer_name || "",
        r.mpesa_receipt_number || "",
        String(r.amount || ""),
        r.message,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [smsRows, smsSearch]);

  const openSmsMatch = (sms: SmsRow) => {
    setSelectedSms(sms);
    setSelectedTransaction(null);
    setSelectedSaleId("");
    setMatchOpen(true);
  };

  const openTransactionMatch = (tx: MpesaRow) => {
    setSelectedTransaction(tx);
    setSelectedSms(null);
    setSelectedSaleId("");
    setMatchOpen(true);
  };

  const matchPayment = async () => {
    if (!selectedSaleId || (!selectedSms && !selectedTransaction)) return;
    setMatching(true);
    try {
      const { data, error } = await (supabase as any).rpc("match_mpesa_payment_to_sale", {
        _sale_id: selectedSaleId,
        _sms_id: selectedSms?.id ?? null,
        _transaction_id: selectedTransaction?.id ?? null,
      });
      if (error) throw error;
      toast.success(`M-Pesa payment matched to sale. ${Number(data?.amount || 0).toLocaleString()} KES recorded.`);
      setMatchOpen(false);
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Could not match M-Pesa payment");
    } finally {
      setMatching(false);
    }
  };

  const autoReconcile = async () => {
    if (!business?.id) return;
    setAutoReconciling(true);
    try {
      const { data, error } = await (supabase as any).rpc("auto_reconcile_mpesa_sms", { _business_id: business.id });
      if (error) throw error;
      toast.success(`${data || 0} incoming SMS record(s) reconciled.`);
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Automatic reconciliation failed");
    } finally {
      setAutoReconciling(false);
    }
  };

  if (entitlementLoading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!canView)
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">M-Pesa is not included in your plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask your administrator to enable the M-Pesa premium module.
            </p>
          </CardContent>
        </Card>
      </div>
    );

  const completed = rows.filter((r) => r.status === "completed");
  const unmatchedSms = smsRows.filter((r) => r.status === "unmatched");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="h-6 w-6" />
            <h1 className="text-2xl font-bold">M-Pesa</h1>
          </div>
          <p className="text-sm text-muted-foreground">STK Push, incoming SMS payments and reconciliation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading || smsLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading || smsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canConfigure && (
            <Button asChild>
              <Link to="/settings?tab=gateways">
                <Settings2 className="mr-2 h-4 w-4" />
                M-Pesa Settings
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completed</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{completed.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{rows.filter((r) => r.status === "pending").length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completed Value</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            KES {completed.reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Unmatched SMS</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{unmatchedSms.length}</CardContent>
        </Card>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
        {canViewTransactions && (
          <Button variant={tab === "transactions" ? "default" : "ghost"} onClick={() => setTab("transactions")}>
            Transactions
          </Button>
        )}
        {canSms && (
          <Button variant={tab === "sms" ? "default" : "ghost"} onClick={() => setTab("sms")}>
            <MessageSquareText className="mr-2 h-4 w-4" />
            Incoming SMS
          </Button>
        )}
        {canReconcile && (
          <Button variant={tab === "reconciliation" ? "default" : "ghost"} onClick={() => setTab("reconciliation")}>
            Reconciliation
          </Button>
        )}
      </div>

      {tab === "transactions" && canViewTransactions && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>M-Pesa Transactions</CardTitle>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search phone, receipt or sale"
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No M-Pesa transactions found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Receipt</th>
                      <th className="px-3 py-2">Status</th>
                      {canManualMatch && <th className="px-3 py-2">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const meta = statusMeta[r.status] || statusMeta.pending;
                      const Icon = meta.icon;
                      return (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="px-3 py-3">{new Date(r.created_at).toLocaleString("en-KE")}</td>
                          <td className="px-3 py-3 font-medium">{r.phone_number}</td>
                          <td className="px-3 py-3">KES {Number(r.amount).toLocaleString()}</td>
                          <td className="px-3 py-3 font-mono text-xs">{r.mpesa_receipt_number || "—"}</td>
                          <td className="px-3 py-3">
                            <Badge variant={meta.variant}>
                              <Icon className="mr-1 h-3 w-3" />
                              {meta.label}
                            </Badge>
                          </td>
                          {canManualMatch && (
                            <td className="px-3 py-3">
                              {r.status === "completed" && !r.sale_id ? (
                                <Button size="sm" variant="outline" onClick={() => openTransactionMatch(r)}>
                                  <Link2 className="mr-1 h-3 w-3" />
                                  Match
                                </Button>
                              ) : r.sale_id ? (
                                <Badge variant="secondary">Linked</Badge>
                              ) : null}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "sms" && canSms && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Incoming M-Pesa SMS</CardTitle>
                <p className="text-sm text-muted-foreground">Messages received from your GSM modem or SMS gateway.</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={smsSearch}
                  onChange={(e) => setSmsSearch(e.target.value)}
                  placeholder="Search receipt, payer, phone"
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {smsLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : filteredSms.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No incoming M-Pesa SMS messages found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSms.map((r) => (
                  <div key={r.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              r.status === "matched"
                                ? "default"
                                : r.status === "unmatched"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {r.status}
                          </Badge>
                          <span className="font-mono text-sm">{r.mpesa_receipt_number || "No receipt parsed"}</span>
                          <span className="font-semibold">KES {Number(r.amount || 0).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium">
                          {r.payer_name || "Unknown payer"} {r.sender_phone ? `• ${r.sender_phone}` : ""}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground break-words">{r.message}</p>
                      </div>
                      {canManualMatch && r.status === "unmatched" && (
                        <Button size="sm" onClick={() => openSmsMatch(r)}>
                          <Link2 className="mr-1 h-4 w-4" />
                          Match to Sale
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "reconciliation" && canReconcile && (
        <Card>
          <CardHeader>
            <CardTitle>M-Pesa Reconciliation</CardTitle>
            <p className="text-sm text-muted-foreground">
              Link incoming SMS confirmations to STK transactions, then match payments to outstanding sales.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Unmatched SMS</p>
                <p className="mt-1 text-2xl font-bold">{unmatchedSms.length}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Completed Unlinked STK</p>
                <p className="mt-1 text-2xl font-bold">{completed.filter((r) => !r.sale_id).length}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Linked Payments</p>
                <p className="mt-1 text-2xl font-bold">{completed.filter((r) => !!r.sale_id).length}</p>
              </div>
            </div>
            {canAutoReconcile && (
              <Button onClick={autoReconcile} disabled={autoReconciling}>
                <Zap className="mr-2 h-4 w-4" />
                {autoReconciling ? "Reconciling..." : "Auto-Reconcile SMS"}
              </Button>
            )}
            {canManualMatch && (
              <p className="text-sm text-muted-foreground">
                Use <strong>Match</strong> on an incoming SMS or completed STK transaction to post the payment against
                an outstanding invoice.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Match M-Pesa Payment to Sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span>Amount</span>
                <strong>KES {Number(selectedSms?.amount ?? selectedTransaction?.amount ?? 0).toLocaleString()}</strong>
              </div>
              <div className="flex justify-between">
                <span>Receipt</span>
                <span className="font-mono">
                  {selectedSms?.mpesa_receipt_number ?? selectedTransaction?.mpesa_receipt_number ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Phone</span>
                <span>{selectedSms?.sender_phone ?? selectedTransaction?.phone_number ?? "—"}</span>
              </div>
            </div>
            <div>
              <Label>Outstanding Sale / Invoice</Label>
              <Select value={selectedSaleId} onValueChange={setSelectedSaleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an outstanding invoice" />
                </SelectTrigger>
                <SelectContent>
                  {sales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.invoice_number || s.id.slice(0, 8)} • KES {Number(s.total).toLocaleString()} •{" "}
                      {s.payment_status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchOpen(false)}>
              Cancel
            </Button>
            <Button onClick={matchPayment} disabled={!selectedSaleId || matching}>
              {matching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Match Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
