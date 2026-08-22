import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import ManagerApprovalDialog from "@/components/pos/ManagerApprovalDialog";
import type { Sale } from "@/hooks/useSales";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
}

interface EditableLine {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  originalQuantity: number;
  removed?: boolean;
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export default function SaleEditDialog({ open, onOpenChange, sale }: Props) {
  const { business, userRole } = useBusiness();
  const qc = useQueryClient();
  const isCashier = userRole === "cashier";
  const { hasPermission } = usePermissions();

  const [lines, setLines] = useState<EditableLine[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvedBy, setApprovedBy] = useState<string | null>(null);

  // A sale that is already posted (finalised, not a draft) needs manager approval
  // before a cashier may change it.
  const isPosted = !!sale && sale.status !== "draft";
  const needsApproval = isCashier && isPosted && !approvedBy;
  const fiscalLocked =
    !!sale?.fiscal_status && ["submitted", "accepted"].includes(String(sale.fiscal_status));

  useEffect(() => {
    if (!open || !sale) return;
    setApprovedBy(null);
    setNotes(sale.notes || "");
    setLoading(true);
    supabase
      .from("sale_items")
      .select("id, product_id, quantity, unit_price, discount, products(name)")
      .eq("sale_id", sale.id)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setLines(
          (data || []).map((r: any) => ({
            id: r.id,
            product_id: r.product_id,
            name: r.products?.name || "—",
            quantity: Number(r.quantity),
            unit_price: Number(r.unit_price),
            discount: Number(r.discount || 0),
            originalQuantity: Number(r.quantity),
          })),
        );
        setLoading(false);
      });
  }, [open, sale]);

  const active = lines.filter((l) => !l.removed);

  const totals = useMemo(() => {
    const subtotal = active.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const discount = active.reduce((s, l) => s + l.discount, 0);
    const taxRate = sale && Number(sale.subtotal) > 0 ? Number(sale.tax) / Number(sale.subtotal) : 0;
    const tax = round2(subtotal * taxRate);
    return { subtotal: round2(subtotal), discount: round2(discount), tax, total: round2(subtotal - discount + tax) };
  }, [active, sale]);

  const setLine = (id: string, patch: Partial<EditableLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handleSave = async (approvalOverride?: string) => {
    if (!sale || !business) return;
    if (!hasPermission("sales.edit")) { toast.error("Missing permission: sales.edit"); return; }
    const approver = approvalOverride ?? approvedBy;
    if (fiscalLocked) {
      toast.error("This invoice has been fiscalised and can no longer be edited.");
      return;
    }
    if (active.length === 0) {
      toast.error("An invoice must have at least one line.");
      return;
    }
    if (isCashier && isPosted && !approver) {
      setApprovalOpen(true);
      return;
    }
    setSaving(true);
    try {
      // 1. Apply line changes
      for (const l of lines) {
        if (l.removed) {
          const { error } = await supabase.from("sale_items").delete().eq("id", l.id);
          if (error) throw error;
        } else {
          const total = round2(l.quantity * l.unit_price - l.discount);
          const { error } = await supabase
            .from("sale_items")
            .update({ quantity: l.quantity, unit_price: l.unit_price, discount: l.discount, total })
            .eq("id", l.id);
          if (error) throw error;
        }
      }

      // 2. Re-apply inventory deltas at the sale's location (selling more removes stock)
      for (const l of lines) {
        const newQty = l.removed ? 0 : l.quantity;
        const delta = newQty - l.originalQuantity;
        if (!delta) continue;
        const { data: invRow } = await supabase
          .from("inventory")
          .select("id, quantity")
          .eq("product_id", l.product_id)
          .eq("location_id", sale.location_id)
          .maybeSingle();
        if (invRow) {
          const { error } = await supabase
            .from("inventory")
            .update({ quantity: Number(invRow.quantity) - delta })
            .eq("id", invRow.id);
          if (error) throw error;
        }
      }

      // 3. Update the invoice header — this re-runs the accounting posting trigger
      const { error: saleErr } = await supabase
        .from("sales")
        .update({
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: totals.discount,
          total: totals.total,
          notes,
        })
        .eq("id", sale.id);
      if (saleErr) throw saleErr;

      const { logAudit } = await import("@/lib/audit");
      await logAudit({
        business_id: business.id,
        action: "sale_edited",
        entity_type: "sale",
        entity_id: sale.id,
        description: `Edited invoice ${sale.invoice_number || sale.id}: total KES ${Number(sale.total).toLocaleString()} → KES ${totals.total.toLocaleString()}`,
        metadata: {
          invoice_number: sale.invoice_number,
          previous_total: Number(sale.total),
          new_total: totals.total,
          approved_by: approver,
        },
      });

      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["daily-sales-report"] });
      qc.invalidateQueries({ queryKey: ["report-sales"] });
      toast.success("Invoice updated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  };

  if (!sale) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit invoice {sale.invoice_number || "—"}</DialogTitle>
            <DialogDescription>
              Change quantities, prices or line discounts. Stock and accounting entries are updated automatically.
            </DialogDescription>
          </DialogHeader>

          {fiscalLocked && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5" />
              This invoice has been submitted to KRA and cannot be edited. Cancel it and issue a new one instead.
            </div>
          )}
          {isCashier && isPosted && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 text-amber-600" />
              {approvedBy
                ? "Manager approval granted for this edit."
                : "This invoice is already posted — an admin/manager password is required to save changes."}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading items…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-32 text-right">Unit price</TableHead>
                  <TableHead className="w-28 text-right">Discount</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id} className={l.removed ? "opacity-40 line-through" : ""}>
                    <TableCell>{l.name}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="h-8 text-right"
                        value={l.quantity}
                        disabled={l.removed || fiscalLocked}
                        onChange={(e) => setLine(l.id, { quantity: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="h-8 text-right"
                        value={l.unit_price}
                        disabled={l.removed || fiscalLocked}
                        onChange={(e) => setLine(l.id, { unit_price: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="h-8 text-right"
                        value={l.discount}
                        disabled={l.removed || fiscalLocked}
                        onChange={(e) => setLine(l.id, { discount: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {round2(l.quantity * l.unit_price - l.discount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={l.removed ? "Restore line" : "Remove line"}
                        disabled={fiscalLocked}
                        onClick={() => setLine(l.id, { removed: !l.removed })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for the change…" />
          </div>

          <Separator />

          <div className="flex justify-end">
            <div className="w-56 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{totals.subtotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{totals.tax.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{totals.discount.toLocaleString()}</span></div>
              <Separator />
              <div className="flex justify-between font-semibold"><span>Total</span><span>KES {totals.total.toLocaleString()}</span></div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving || loading || fiscalLocked || !hasPermission("sales.edit")}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {needsApproval ? "Approve & save" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManagerApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        title="Admin approval required"
        description="Editing a posted sales invoice requires an admin or manager password."
        onApproved={(managerId) => {
          setApprovedBy(managerId);
          setApprovalOpen(false);
          // Save immediately once approval is granted.
          void handleSave(managerId);
        }}
      />
    </>
  );

}
