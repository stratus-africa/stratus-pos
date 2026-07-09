import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Sale, SaleItem, Payment, useSales } from "@/hooks/useSales";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { loadReceiptConfig } from "@/lib/receiptTemplate";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
}

export default function SaleDetailDialog({ open, onOpenChange, sale }: Props) {
  const { getSaleDetails } = useSales();
  const { business } = useBusiness();
  const { user } = useAuth();
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
    const win = window.open("", "_blank", "width=340,height=600");
    if (!win) {
      toast.error("Popup blocked. Allow popups to print receipts.");
      return;
    }
    const cfg = loadReceiptConfig(business?.id);
    const businessName = cfg.header || business?.name || "";
    const businessAddress = (business as { address?: string } | null)?.address || "";
    const businessPhone = (business as { phone?: string } | null)?.phone || "";
    const logoUrl = business?.logo_url || "";
    const currency = business?.currency || "KES";
    const locationName = sale.locations?.name || "";
    const customerName = sale.customers?.name || "";
    const fmt = (n: number | string) => Number(n || 0).toLocaleString();
    const servedBy = ((user?.user_metadata as { full_name?: string } | undefined)?.full_name) || user?.email || "—";
    const printedAt = format(new Date(), "PPp");

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
        body { font-family: ${cfg.fontFamily}; font-size: ${cfg.fontSize}px; width: 300px; margin: 0 auto; padding: 10px; color:#000; line-height:1.45; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .header-name { font-weight: bold; font-size: ${cfg.headerFontSize}px; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; vertical-align: top; }
        .total { font-weight: bold; font-size: ${cfg.fontSize + 1}px; }
        .reprint { text-align:center; font-size: 10px; margin-top: 4px; letter-spacing: 1px; }
        .footer-small { text-align:center; font-size: ${Math.max(9, cfg.fontSize - 1)}px; opacity: 0.85; }
        .logo { max-height: 64px; max-width: 100%; margin: 0 auto 4px; display:block; object-fit: contain; }
        @media print { body { margin: 0; } }
      </style></head><body>
        <div class="center">
          ${cfg.showLogo && logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="logo" />` : ""}
          <div class="header-name">${escapeHtml(businessName)}</div>
          ${cfg.showAddress && businessAddress ? `<div>${escapeHtml(businessAddress)}</div>` : ""}
          ${cfg.showPhone && businessPhone ? `<div>${escapeHtml(businessPhone)}</div>` : ""}
          ${locationName ? `<div>${escapeHtml(locationName)}</div>` : ""}
        </div>
        <div class="line"></div>
        <div>Invoice: ${escapeHtml(sale.invoice_number || "—")}</div>
        <div>Date: ${format(new Date(sale.created_at), "PPp")}</div>
        ${customerName ? `<div>Customer: ${escapeHtml(customerName)}</div>` : ""}
        <div class="line"></div>
        <table><tbody>${itemRows}</tbody></table>
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
        ${cfg.showTaxBreakdown && Number(sale.tax) > 0 ? `<div class="row"><span>VAT</span><span>${fmt(sale.tax)}</span></div>` : ""}
        ${Number(sale.discount) > 0 ? `<div class="row"><span>Discount</span><span>-${fmt(sale.discount)}</span></div>` : ""}
        <div class="row total"><span>TOTAL</span><span>${escapeHtml(currency)} ${fmt(sale.total)}</span></div>
        <div class="line"></div>
        ${paymentRows || `<div class="row"><span>Unpaid</span><span>—</span></div>`}
        <div class="line"></div>
        <div class="center">${escapeHtml(cfg.thankYouMessage || "")}</div>
        ${cfg.footer ? `<div class="center" style="white-space:pre-wrap">${escapeHtml(cfg.footer)}</div>` : ""}
        ${(cfg.showServedBy || cfg.showPrintedAt) ? `<div class="line"></div>` : ""}
        ${cfg.showServedBy ? `<div class="footer-small">Served by: ${escapeHtml(servedBy)}</div>` : ""}
        ${cfg.showPrintedAt ? `<div class="footer-small">Printed: ${escapeHtml(printedAt)}</div>` : ""}
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
              {sale.fiscal_invoice_number && <div><span className="text-muted-foreground">Fiscal invoice:</span> {sale.fiscal_invoice_number}</div>}
              {sale.fiscal_reference && <div><span className="text-muted-foreground">Reference:</span> {sale.fiscal_reference}</div>}
              {sale.fiscal_verification_url && (
                <div>
                  <span className="text-muted-foreground">Verify:</span>{" "}
                  <a className="text-primary underline break-all" href={sale.fiscal_verification_url} target="_blank" rel="noreferrer">
                    {sale.fiscal_verification_url}
                  </a>
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
