import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Sale, SaleItem, Payment, useSales } from "@/hooks/useSales";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { CreditCard, Printer, RefreshCw, RotateCcw, Ban, Clock } from "lucide-react";
import { toast } from "sonner";
import ReceiptDialog from "@/components/pos/ReceiptDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
}

export default function SaleDetailDialog({ open, onOpenChange, sale }: Props) {
  const { getSaleDetails, retryFiscalisation, requestRefund, getSaleTimeline } = useSales();
  const { business, userRole } = useBusiness();
  const { hasPermission } = usePermissions();
  const canRetryFiscal = userRole !== "cashier";
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const [reprintOpen, setReprintOpen] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    if (sale && open) {
      setLoading(true);
      setFiscalError(null);
      getSaleDetails(sale.id)
        .then(({ items, payments }) => {
          setItems(items);
          setPayments(payments);
        })
        .finally(() => setLoading(false));
      // Fetch latest DigiTax queue row for this sale (for error message)
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase
          .from("digitax_invoice_queue")
          .select("error_message,status")
          .eq("sale_id", sale.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => setFiscalError(data?.error_message ?? null));
      });
    }
  }, [sale, open]);

  if (!sale) return null;

  const statusColor =
    sale.payment_status === "paid" ? "default" : sale.payment_status === "partial" ? "secondary" : "destructive";

  // Per-item VAT: honour the rate stored on the line, then the product's own
  // rate, then the business default. Only when VAT is switched on.
  const vatEnabled = (business as { vat_enabled?: boolean } | null)?.vat_enabled ?? true;
  const taxInclusive = (business as { tax_inclusive_pricing?: boolean } | null)?.tax_inclusive_pricing ?? true;
  const lineRate = (it: SaleItem): number => {
    if (!vatEnabled) return 0;
    if (typeof it.tax_rates?.rate === "number") return Number(it.tax_rates.rate);
    if (typeof it.products?.tax_rate === "number") return Number(it.products.tax_rate);
    return Number(business?.tax_rate ?? 16);
  };
  const vatBreakdown = (() => {
    if (!vatEnabled) return [];
    const map = new Map<number, { rate: number; label: string; taxable: number; vat: number }>();
    for (const it of items) {
      const pct = lineRate(it);
      if (!pct) continue;
      const gross = Number(it.quantity) * Number(it.unit_price) - Number(it.discount || 0);
      const r = pct / 100;
      const net = taxInclusive ? gross / (1 + r) : gross;
      const vat = taxInclusive ? gross - net : gross * r;
      const key = Math.round(pct * 100) / 100;
      const row = map.get(key);
      if (row) { row.taxable += net; row.vat += vat; }
      else map.set(key, { rate: key, label: `VAT ${key}%`, taxable: net, vat });
    }
    return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
  })();

  // Build the same payload the POS receipt uses so the reprint matches the
  // configured customization layout exactly.
  const receiptPayload = {
    saleId: sale.id,
    invoiceNumber: sale.invoice_number || "",
    items: items.map((it) => ({
      product: { name: it.products?.name || "—" },
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      discount: Number(it.discount || 0),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    payments: payments.map((p) => ({ method: p.method, amount: Number(p.amount), reference: p.reference })),
    totalPaid: payments.reduce((s, p) => s + Number(p.amount || 0), 0),
    change: 0,
    customerName: sale.customers?.name || null,
    locationName: sale.locations?.name || "",
    businessName: business?.name || "",
    servedBy: (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || null,
    date: new Date(sale.created_at),
    fiscal: {
      fiscal_status: sale.fiscal_status,
      fiscal_invoice_number: sale.fiscal_invoice_number,
      fiscal_reference: sale.fiscal_reference,
      fiscal_verification_url: sale.fiscal_verification_url,
      fiscal_error: fiscalError,
    },
    vatBreakdown,
    taxInclusive,
  } as any;

  const handleReprint = () => {
    if (loading) {
      toast.info("Loading receipt details…");
      return;
    }
    setReprintOpen(true);
  };

  const handleRefund = () => {
    if (!sale) return;
    const raw = window.prompt("Refund amount (KES)");
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const reason = window.prompt("Refund reason")?.trim();
    if (!reason) return;
    requestRefund.mutate({ saleId: sale.id, amount, reason });
  };

  const handleTimeline = async () => {
    if (!sale) return;
    try { setTimeline(await getSaleTimeline(sale.id)); setShowTimeline(true); } catch (e: any) { toast.error(e.message); }
  };

  const handleRecordPayment = () => {
    if (loading) {
      toast.info("Loading receipt details…");
      return;
    }
    if (!sale.customer_id) {
      toast.error("A customer is required to record payment for a credit sale.");
      return;
    }

    sessionStorage.setItem(
      "stratuspos.creditSaleToSettle",
      JSON.stringify({
        saleId: sale.id,
        customerId: sale.customer_id,
        customerName: sale.customers?.name || "Customer",
        invoiceNumber: sale.invoice_number || "",
      }),
    );
    onOpenChange(false);
    navigate({ to: "/pos" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-full [&>button]:border [&>button]:bg-background [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:hover:bg-muted [&>button]:focus:ring-2 [&>button]:focus:ring-ring">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Invoice {sale.invoice_number || "—"}
            <Badge variant={statusColor}>{sale.payment_status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Date:</span> {format(new Date(sale.created_at), "PPp")}
          </div>
          <div>
            <span className="text-muted-foreground">Location:</span> {sale.locations?.name}
          </div>
          <div>
            <span className="text-muted-foreground">Customer:</span> {sale.customers?.name || "Walk-in"}
          </div>
          <div>
            <span className="text-muted-foreground">Status:</span> {sale.status}
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="font-semibold mb-2">Items</h4>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Disc.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.products?.name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{Number(item.unit_price).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(item.discount).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(item.total).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex justify-end">
          <div className="text-sm space-y-1 w-48">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{Number(sale.subtotal).toLocaleString()}</span>
            </div>
            {Number(sale.tax) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{Number(sale.tax).toLocaleString()}</span>
              </div>
            )}
            {Number(sale.discount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{Number(sale.discount).toLocaleString()}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>KES {Number(sale.total).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {sale.fiscal_status && (
          <>
            <Separator />
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="font-semibold">KRA Fiscal Receipt</span>
                <Badge
                  variant="outline"
                  className={
                    sale.fiscal_status === "accepted" || sale.fiscal_status === "submitted"
                      ? "border-emerald-500 text-emerald-700"
                      : sale.fiscal_status === "failed"
                        ? "border-destructive text-destructive"
                        : "border-amber-500 text-amber-700"
                  }
                >
                  {sale.fiscal_status.replace("_", " ")}
                </Badge>
              </div>
              {sale.fiscal_invoice_number && (
                <div>
                  <span className="text-muted-foreground">Fiscal invoice:</span> {sale.fiscal_invoice_number}
                </div>
              )}
              {sale.fiscal_reference && (
                <div>
                  <span className="text-muted-foreground">Reference:</span> {sale.fiscal_reference}
                </div>
              )}
              {sale.fiscal_verification_url && (
                <div>
                  <span className="text-muted-foreground">Verify:</span>{" "}
                  <a
                    className="text-primary underline break-all"
                    href={sale.fiscal_verification_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {sale.fiscal_verification_url}
                  </a>
                </div>
              )}
              {fiscalError && (
                <div className="text-destructive text-xs pt-1">
                  <span className="font-semibold">Error:</span> {fiscalError}
                </div>
              )}
              {canRetryFiscal && (sale.fiscal_status === "failed" || sale.fiscal_status === "retry_required") && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sale && retryFiscalisation.mutate(sale.id)}
                    disabled={retryFiscalisation.isPending}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Retry KRA submission
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {payments.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="font-semibold mb-2">Payments</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="capitalize">{p.method}</TableCell>
                      <TableCell className="text-right">{Number(p.amount).toLocaleString()}</TableCell>
                      <TableCell>{p.reference || "—"}</TableCell>
                      <TableCell>{format(new Date(p.created_at), "PP")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {showTimeline && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4" /> Sale Timeline</div>
            {timeline.length === 0 ? <p className="text-sm text-muted-foreground">No lifecycle events recorded yet.</p> : timeline.map((e) => (
              <div key={e.id} className="border-l-2 pl-3 text-sm"><div className="font-medium">{String(e.event_type).replaceAll("_", " ")}</div><div className="text-muted-foreground">{format(new Date(e.created_at), "PPp")}{e.amount ? ` · KES ${Number(e.amount).toLocaleString()}` : ""}</div></div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {hasPermission("sales.record_payment") && sale.payment_status !== "paid" && sale.payment_status !== "cancelled" && (
            <Button onClick={handleRecordPayment} disabled={loading} className="w-full sm:w-auto"><CreditCard className="h-4 w-4 mr-1" /> Record Payment</Button>
          )}
          {hasPermission("sales.refund") && sale.status !== "cancelled" && sale.status !== "refunded" && (
            <Button variant="outline" onClick={handleRefund} disabled={loading || requestRefund.isPending} className="w-full sm:w-auto"><RotateCcw className="h-4 w-4 mr-1" /> Refund</Button>
          )}
          {hasPermission("sales.timeline") && <Button variant="outline" onClick={handleTimeline} disabled={loading} className="w-full sm:w-auto"><Clock className="h-4 w-4 mr-1" /> Timeline</Button>}
          {hasPermission("sales.print_invoice") && <Button variant="outline" onClick={handleReprint} disabled={loading} className="w-full sm:w-auto"><Printer className="h-4 w-4 mr-1" /> Reprint Receipt</Button>}
        </DialogFooter>

        <ReceiptDialog open={reprintOpen} onOpenChange={setReprintOpen} data={receiptPayload} reprint />
      </DialogContent>
    </Dialog>
  );
}
