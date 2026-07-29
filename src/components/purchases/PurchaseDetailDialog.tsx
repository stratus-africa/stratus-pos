import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Pencil, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { exportPurchaseDocumentToExcel } from "@/lib/purchaseExport";
import type { Purchase } from "@/hooks/usePurchases";

interface Line {
  quantity: number;
  unit_cost: number;
  total: number;
  products?: { name: string | null; sku: string | null; barcode: string | null } | null;
}

const formatKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 }).format(Number(n || 0));

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function PurchaseDetailDialog({
  purchase,
  open,
  onOpenChange,
  onEdit,
}: {
  purchase: Purchase | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit?: (p: Purchase) => void;
}) {
  const { business } = useBusiness();
  const [items, setItems] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !purchase) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("purchase_items")
      .select("quantity, unit_cost, total, products(name, sku, barcode)")
      .eq("purchase_id", purchase.id)
      .then(({ data }) => {
        if (!cancelled) {
          setItems((data as unknown as Line[]) ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, purchase]);

  const handlePrint = () => {
    if (!purchase) return;
    const rows = items
      .map(
        (i, idx) => `<tr>
          <td class="c">${idx + 1}</td>
          <td>${escapeHtml(i.products?.name || "—")}${
            i.products?.sku ? `<div class="muted">${escapeHtml(i.products.sku)}</div>` : ""
          }</td>
          <td class="r">${Number(i.quantity).toLocaleString()}</td>
          <td class="r">${formatKES(i.unit_cost)}</td>
          <td class="r">${formatKES(i.total)}</td>
        </tr>`,
      )
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Purchase ${escapeHtml(purchase.invoice_number || purchase.id.slice(0, 8))}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
        h1{font-size:18px;margin:0 0 2px}
        .muted{color:#666;font-size:10px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
        .meta{margin-bottom:14px;display:flex;gap:40px}
        .meta div span{display:block}
        .lbl{color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
        table{width:100%;border-collapse:collapse}
        th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left;vertical-align:top}
        th{background:#f4f4f5;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
        .r{text-align:right}.c{text-align:center;width:28px}
        tfoot td{border:none;padding:3px 4px}
        .tot{font-weight:bold;border-top:2px solid #111 !important}
        .foot{margin-top:28px;color:#666;font-size:10px}
        @media print{body{margin:10mm}}
      </style></head><body>
      <div class="head">
        <div>
          <h1>${escapeHtml(business?.name || "Purchase Order")}</h1>
          <div class="muted">${business?.kra_pin ? "KRA PIN: " + escapeHtml(business.kra_pin) : ""}</div>

        </div>
        <div style="text-align:right">
          <h1>PURCHASE</h1>
          <div class="muted">${escapeHtml(purchase.invoice_number || purchase.id.slice(0, 8))}</div>
          <div class="muted">${new Date(purchase.created_at).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</div>
        </div>
      </div>
      <div class="meta">
        <div><span class="lbl">Supplier</span><span>${escapeHtml(purchase.suppliers?.name || "—")}</span></div>
        <div><span class="lbl">Location</span><span>${escapeHtml(purchase.locations?.name || "—")}</span></div>
        <div><span class="lbl">Status</span><span>${escapeHtml(purchase.status)}</span></div>
        <div><span class="lbl">Payment</span><span>${escapeHtml(purchase.payment_status)}</span></div>
      </div>
      <table>
        <thead><tr><th class="c">#</th><th>Item</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Total</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="c">No items</td></tr>`}</tbody>
        <tfoot>
          <tr><td colspan="3"></td><td class="r">Subtotal</td><td class="r">${formatKES(purchase.subtotal)}</td></tr>
          <tr><td colspan="3"></td><td class="r">VAT</td><td class="r">${formatKES(purchase.tax)}</td></tr>
          <tr><td colspan="3"></td><td class="r tot">Total</td><td class="r tot">${formatKES(purchase.total)}</td></tr>
        </tfoot>
      </table>
      ${purchase.notes ? `<div class="foot"><strong>Notes:</strong> ${escapeHtml(purchase.notes)}</div>` : ""}
      <div class="foot">Printed ${new Date().toLocaleString("en-KE")}</div>
      </body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  if (!purchase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Purchase {purchase.invoice_number || purchase.id.slice(0, 8)}
            <Badge variant={purchase.status === "received" ? "default" : purchase.status === "cancelled" ? "destructive" : "secondary"}>
              {purchase.status}
            </Badge>
            <Badge variant={purchase.payment_status === "paid" ? "default" : purchase.payment_status === "partial" ? "secondary" : "destructive"}>
              {purchase.payment_status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Supplier</div>
            <div className="font-medium">{purchase.suppliers?.name || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Location</div>
            <div className="font-medium">{purchase.locations?.name || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Date</div>
            <div className="font-medium">
              {new Date(purchase.created_at).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-medium">{formatKES(purchase.total)}</div>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">Loading...</TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No items on this purchase.</TableCell>
                </TableRow>
              ) : (
                items.map((i, idx) => (
                  <TableRow key={idx} className="odd:bg-muted/40">
                    <TableCell>
                      <div className="font-medium">{i.products?.name || "—"}</div>
                      {i.products?.sku && <div className="text-xs text-muted-foreground">{i.products.sku}</div>}
                    </TableCell>
                    <TableCell className="text-right">{Number(i.quantity).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatKES(i.unit_cost)}</TableCell>
                    <TableCell className="text-right font-medium">{formatKES(i.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col items-end gap-1 text-sm">
          <div className="flex gap-8"><span className="text-muted-foreground">Subtotal</span><span>{formatKES(purchase.subtotal)}</span></div>
          <div className="flex gap-8"><span className="text-muted-foreground">VAT</span><span>{formatKES(purchase.tax)}</span></div>
          <div className="flex gap-8 font-semibold text-base"><span>Total</span><span>{formatKES(purchase.total)}</span></div>
        </div>

        {purchase.notes && (
          <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Notes: </span>{purchase.notes}</p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {onEdit && (
            <Button variant="outline" onClick={() => onEdit(purchase)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={() => exportPurchaseDocumentToExcel(purchase, items, business?.name)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
