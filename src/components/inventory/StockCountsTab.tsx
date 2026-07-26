import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardCheck, Plus, Search, Trash2 } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/hooks/useProducts";
import { useStockCounts, type StockCount, type StockCountStatus } from "@/hooks/useStockCounts";
import { toast } from "sonner";

const statusMeta: Record<StockCountStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  assigned: { label: "Assigned", variant: "secondary" },
  submitted: { label: "Awaiting approval", variant: "default" },
  approved: { label: "Approved", variant: "secondary" },
  rejected: { label: "Sent back", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function StockCountsTab() {
  const { locations, currentLocation, userRole } = useBusiness();
  const { user } = useAuth();
  const { productsQuery } = useProducts();
  const {
    countsQuery, assigneesQuery, createCount, saveCounts,
    submitCount, approveCount, rejectCount, deleteCount,
  } = useStockCounts();

  const isApprover = userRole === "admin" || userRole === "manager";
  const canCreate = isApprover || userRole === "stores_manager";

  const [newOpen, setNewOpen] = useState(false);
  const [openCount, setOpenCount] = useState<StockCount | null>(null);

  const counts = countsQuery.data ?? [];
  const assignees = assigneesQuery.data ?? [];
  const products = useMemo(
    () => (productsQuery.data ?? []).filter((p) => p.is_active),
    [productsQuery.data],
  );

  // ---- New count form state
  const [locationId, setLocationId] = useState(currentLocation?.id ?? "");
  const [reference, setReference] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  const resetForm = () => {
    setLocationId(currentLocation?.id ?? "");
    setReference("");
    setAssignedTo("none");
    setNotes("");
    setProductSearch("");
    setSelected(new Set());
  };

  const toggleProduct = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (!locationId) return toast.error("Choose a location");
    if (selected.size === 0) return toast.error("Add at least one product to count");
    createCount.mutate(
      {
        location_id: locationId,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        assigned_to: assignedTo === "none" ? null : assignedTo,
        product_ids: Array.from(selected),
      },
      { onSuccess: () => { setNewOpen(false); resetForm(); } },
    );
  };

  const nameOf = (id: string | null) => {
    if (!id) return "Unassigned";
    const a = assignees.find((x) => x.id === id);
    return a?.full_name || a?.email || "User";
  };
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Stock Takes
          </CardTitle>
          {canCreate && (
            <Button size="sm" onClick={() => { resetForm(); setNewOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> New stock count
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {counts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No stock counts yet. Create a count sheet, assign it to a user, and approve it once submitted.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Assigned to</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.map((c) => (
                    <TableRow key={c.id} className="odd:bg-muted/30">
                      <TableCell className="font-medium">{c.reference || c.id.slice(0, 8)}</TableCell>
                      <TableCell>{locationName(c.location_id)}</TableCell>
                      <TableCell>{nameOf(c.assigned_to)}</TableCell>
                      <TableCell className="text-right">{c.stock_count_items?.length ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={statusMeta[c.status]?.variant ?? "outline"}>
                          {statusMeta[c.status]?.label ?? c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => setOpenCount(c)}>Open</Button>
                        {canCreate && c.status !== "approved" && (
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => deleteCount.mutate(c.id)}
                            aria-label="Delete stock count"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New stock count */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New stock count</DialogTitle>
            <DialogDescription>
              Pick the products to count, then assign the sheet to a user.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. July count" />
            </div>
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Products ({selected.size} selected)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => setSelected(new Set(filteredProducts.map((p) => p.id)))}
                >
                  Select all shown
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8" placeholder="Search products…"
                value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {filteredProducts.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleProduct(p.id)} />
                  <span className="flex-1">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.sku}</span>
                </label>
              ))}
              {filteredProducts.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">No products match.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createCount.isPending}>
              {createCount.isPending ? "Creating…" : "Create count sheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {openCount && (
        <StockCountDetailDialog
          count={counts.find((c) => c.id === openCount.id) ?? openCount}
          open={!!openCount}
          onOpenChange={(o) => !o && setOpenCount(null)}
          isApprover={isApprover}
          isAssignee={openCount.assigned_to === user?.id}
          onSave={(items) => saveCounts.mutate({ countId: openCount.id, items })}
          onSubmit={() => submitCount.mutate(openCount.id, { onSuccess: () => setOpenCount(null) })}
          onApprove={() => approveCount.mutate(openCount.id, { onSuccess: () => setOpenCount(null) })}
          onReject={(reason) => rejectCount.mutate({ countId: openCount.id, reason }, { onSuccess: () => setOpenCount(null) })}
          saving={saveCounts.isPending || submitCount.isPending || approveCount.isPending}
        />
      )}
    </div>
  );
}

interface DetailProps {
  count: StockCount;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isApprover: boolean;
  isAssignee: boolean;
  onSave: (items: { id: string; counted_qty: number | null; notes?: string | null }[]) => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  saving: boolean;
}

function StockCountDetailDialog({
  count, open, onOpenChange, isApprover, isAssignee, onSave, onSubmit, onApprove, onReject, saving,
}: DetailProps) {
  const items = count.stock_count_items ?? [];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.counted_qty === null ? "" : String(i.counted_qty)])),
  );
  const [rejectReason, setRejectReason] = useState("");

  const editable = (count.status === "draft" || count.status === "assigned" || count.status === "rejected")
    && (isAssignee || isApprover);

  const payload = () =>
    items.map((i) => ({
      id: i.id,
      counted_qty: values[i.id] === "" || values[i.id] === undefined ? null : Number(values[i.id]),
    }));

  const totalVariance = items.reduce((s, i) => {
    const v = values[i.id];
    if (v === "" || v === undefined) return s;
    return s + (Number(v) - Number(i.expected_qty));
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{count.reference || "Stock count"}</DialogTitle>
          <DialogDescription>
            {statusMeta[count.status]?.label ?? count.status}
            {count.rejection_reason ? ` — ${count.rejection_reason}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right w-32">Counted</TableHead>
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const raw = values[i.id];
                const variance = raw === "" || raw === undefined ? null : Number(raw) - Number(i.expected_qty);
                return (
                  <TableRow key={i.id} className="odd:bg-muted/30">
                    <TableCell>
                      {i.products?.name ?? "Product"}
                      {i.products?.sku && <span className="ml-2 text-xs text-muted-foreground">{i.products.sku}</span>}
                    </TableCell>
                    <TableCell className="text-right">{Number(i.expected_qty)}</TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Input
                          type="number" className="h-8 text-right"
                          value={raw ?? ""}
                          onChange={(e) => setValues((p) => ({ ...p, [i.id]: e.target.value }))}
                        />
                      ) : (
                        i.counted_qty ?? "—"
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${variance && variance < 0 ? "text-destructive" : variance ? "text-emerald-600" : ""}`}>
                      {variance === null ? "—" : variance > 0 ? `+${variance}` : variance}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <p className="text-sm text-muted-foreground">
          Net variance: <span className="font-medium text-foreground">{totalVariance > 0 ? `+${totalVariance}` : totalVariance}</span>
        </p>

        {count.status === "submitted" && isApprover && (
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (required to send back)</Label>
            <Input id="reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
        )}

        <DialogFooter className="gap-2">
          {editable && (
            <>
              <Button variant="outline" onClick={() => onSave(payload())} disabled={saving}>Save progress</Button>
              <Button
                onClick={() => { onSave(payload()); onSubmit(); }}
                disabled={saving}
              >
                Submit for approval
              </Button>
            </>
          )}
          {count.status === "submitted" && isApprover && (
            <>
              <Button
                variant="outline"
                onClick={() => rejectReason.trim() ? onReject(rejectReason.trim()) : toast.error("Add a reason")}
                disabled={saving}
              >
                Send back
              </Button>
              <Button onClick={onApprove} disabled={saving}>Approve &amp; adjust stock</Button>
            </>
          )}
          {!editable && count.status !== "submitted" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
