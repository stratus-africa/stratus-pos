import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Sale, SaleItem, Payment, useSales } from "@/hooks/useSales";
import { useBusiness } from "@/contexts/BusinessContext";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
}

export default function SaleDetailDialog({ open, onOpenChange, sale }: Props) {
  const { getSaleDetails } = useSales();
  const { business } = useBusiness();
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sale && open) {
      setLoading(true);
      getSaleDetails(sale.id)
        .then(({ items, payments }) => { setItems(items); setPayments(payments); })
        .finally(() => setLoading(false));
    }
  }, [sale, open]);

  if (!sale) return null;

  const statusColor = sale.payment_status === "paid" ? "default" : sale.payment_status === "partial" ? "secondary" : "destructive";

  const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

  const handleReprint = () => {
    if (loading) {
      toast.info("Loading receipt details…");
      return;
    }
    const win = window.open("", "_blank", "width=320,height=600");
    if (!win) {
      toast.error("Popup blocked. Allow popups to print receipts.");
      return;
    }
    const businessName = business?.name || "";
    const locationName = sale.locations?.name || "";
    const customerName = sale.customers?.name || "";
    const fmt = (n: number | string) => Number(n || 0).toLocaleString();

    const itemRows = items.map((it) => `
      <tr>
        <td>${escapeHtml(it.products?.name || "—")}</td>
        <td class="right">${fmt(it.quantity)} x ${fmt(it.unit_price)}</td>
        <td class="right">${fmt(it.total)}</td>
      </tr>
    `).join("");

    const paymentRows = payments.map((p) => `
      <div class="row"><span>${escapeHtml(p.method)}${p.reference ? ` (${escapeHtml(p.reference)})` : ""}</span><span>${fmt(p.amount)}</span></div>
    `).join("");

    win.document.write(`
      <html><head><title>Receipt ${escapeHtml(sale.invoice_number || "")}</title>
      <style>
        body { font-family: monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; color:#000; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; vertical-align: top; }
        .total { font-weight: bold; font-size: 13px; }
        .reprint { text-align:center; font-size: 10px; margin-top: 4px; letter-spacing: 1px; }
        @media print { body { margin: 0; } }
      </style></head><body>
        <div class="center">
          <div class="bold" style="font-size:13px">${escapeHtml(businessName)}</div>
          <div>${escapeHtml(locationName)}</div>
          <div>${format(new Date(sale.created_at), "PPp")}</div>
        </div>
        <div class="line"></div>
        <div>Invoice: ${escapeHtml(sale.invoice_number || "—")}</div>
        ${customerName ? `<div>Customer: ${escapeHtml(customerName)}</div>` : ""}
        <div class="line"></div>
        <table><tbody>${itemRows}</tbody></table>
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
        ${Number(sale.tax) > 0 ? `<div class="row"><span>VAT</span><span>${fmt(sale.tax)}</span></div>` : ""}
        ${Number(sale.discount) > 0 ? `<div class="row"><span>Discount</span><span>-${fmt(sale.discount)}</span></div>` : ""}
        <div class="row total"><span>TOTAL</span><span>KES ${fmt(sale.total)}</span></div>
        <div class="line"></div>
        ${paymentRows || `<div class="row"><span>Unpaid</span><span>—</span></div>`}
        <div class="line"></div>
        <div class="center">Thank you for shopping with us!</div>
        <div class="reprint">*** REPRINT ***</div>
        <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 200); };</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Invoice {sale.invoice_number || "—"}
            <Badge variant={statusColor}>{sale.payment_status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Date:</span> {format(new Date(sale.created_at), "PPp")}</div>
          <div><span className="text-muted-foreground">Location:</span> {sale.locations?.name}</div>
          <div><span className="text-muted-foreground">Customer:</span> {sale.customers?.name || "Walk-in"}</div>
          <div><span className="text-muted-foreground">Status:</span> {sale.status}</div>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{Number(sale.subtotal).toLocaleString()}</span></div>
            {Number(sale.tax) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{Number(sale.tax).toLocaleString()}</span></div>}
            {Number(sale.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{Number(sale.discount).toLocaleString()}</span></div>}
            <Separator />
            <div className="flex justify-between font-semibold"><span>Total</span><span>KES {Number(sale.total).toLocaleString()}</span></div>
          </div>
        </div>

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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleReprint} disabled={loading}>
            <Printer className="h-4 w-4 mr-1" /> Reprint Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
