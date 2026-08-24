import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileWarning, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

const REASONS = ["Issue", "Write-off", "Adjustment"] as const;
type Reason = (typeof REASONS)[number];

type Product = { id: string; name: string; sku: string | null; barcode: string | null };
type RequestRow = {
  id: string;
  reason: string;
  reference: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  created_by: string;
  locations?: { name: string } | null;
  stock_adjustments?: { product_id: string; quantity_change: number; products?: { name: string } | null }[];
};

export function StockControlTab() {
  const { business, currentLocation } = useBusiness();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const canIssue = hasPermission("inventory.issue");
  const canWriteoff = hasPermission("inventory.writeoff");
  const canAdjust = hasPermission("inventory.adjust");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("Issue");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["inventory-control-products", business?.id],
    queryFn: async () => {
      if (!business?.id) return [] as Product[];
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,barcode")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: !!business?.id,
  });

  const requestsQuery = useQuery({
    queryKey: ["inventory-control-requests", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business?.id) return [] as RequestRow[];
      let q = supabase
        .from("stock_adjustment_documents" as any)
        .select(
          "id,reason,reference,notes,status,created_at,created_by,locations(name),stock_adjustments(product_id,quantity_change,products(name))",
        )
        .in("reason", ["Issue", "Write-off", "Adjustment"])
        .order("created_at", { ascending: false });
      if (currentLocation?.id) q = q.eq("location_id", currentLocation.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RequestRow[];
    },
    enabled: !!business?.id,
  });

  const canCreate = reason === "Issue" ? canIssue : reason === "Write-off" ? canWriteoff : canAdjust;

  const reset = () => {
    setProductId("");
    setQty("");
    setNotes("");
    setReference("");
    setReason("Issue");
  };

  const submit = async () => {
    if (!user?.id || !currentLocation?.id) return toast.error("Select a location first");
    const quantity = Number(qty);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0)
      return toast.error("Select a product and enter a positive quantity");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_inventory_control_request" as any, {
        _location_id: currentLocation.id,
        _reason: reason,
        _notes: notes || null,
        _reference: reference || null,
        _items: [{ product_id: productId, quantity_change: -quantity }],
      });
      if (error) throw error;
      toast.success(`${reason} request submitted for approval`);
      reset();
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["inventory-control-requests"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not submit request");
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, approve: boolean) => {
    setBusy(true);
    try {
      const result = approve
        ? await supabase.rpc("approve_inventory_control_request" as any, { _document_id: id })
        : await supabase.rpc("reject_inventory_control_request" as any, {
            _document_id: id,
            _reason: "Rejected by approver",
          });
      if (result.error) throw result.error;
      toast.success(approve ? "Request approved and stock updated" : "Request rejected");
      await qc.invalidateQueries({ queryKey: ["inventory-control-requests"] });
      await qc.invalidateQueries({ queryKey: ["inventory"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not review request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div>
          <h3 className="font-semibold">Stock Issues & Write-offs</h3>
          <p className="text-sm text-muted-foreground">
            Requests are held pending approval before inventory is changed.
          </p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Inventory Control Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Type</Label>
                  <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.filter((r) =>
                        r === "Issue" ? canIssue : r === "Write-off" ? canWriteoff : canAdjust,
                      ).map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Product</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {(productsQuery.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.sku ? ` · ${p.sku}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Optional document/reference"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Reason or supporting notes"
                  />
                </div>
                <Button className="w-full" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Submit for Approval
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {(requestsQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <FileWarning className="h-4 w-4" /> No requests yet.
            </div>
          ) : (
            <div className="divide-y">
              {(requestsQuery.data ?? []).slice(0, 20).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          r.status === "rejected" ? "destructive" : r.status === "posted" ? "default" : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                      <span className="font-medium">{r.reason}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("en-KE")} · {r.reference || "No reference"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground max-w-[40%] truncate">{r.notes || ""}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
