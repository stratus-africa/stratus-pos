import { useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  useProductBatches,
  useCreateBatch,
  useUpdateBatch,
  useDeleteBatch,
  type ProductBatch,
} from "@/hooks/useProductBatches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { differenceInDays, format } from "date-fns";

interface BatchesTabProps {
  productId: string;
  productName: string;
}

const blank = (): Partial<ProductBatch> => ({
  batch_number: "",
  manufacture_date: null,
  expiry_date: null,
  quantity: 0,
  unit_cost: 0,
  notes: "",
  is_active: true,
});

export default function BatchesTab({ productId, productName }: BatchesTabProps) {
  const { locations, currentLocation } = useBusiness();
  const { data: batches = [], isLoading } = useProductBatches(productId);
  const createMutation = useCreateBatch();
  const updateMutation = useUpdateBatch();
  const deleteMutation = useDeleteBatch();

  const [editing, setEditing] = useState<Partial<ProductBatch> | null>(null);

  const openNew = () => {
    setEditing({
      ...blank(),
      product_id: productId,
      location_id: currentLocation?.id,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.batch_number || !editing.location_id) return;
    if (editing.id) {
      await updateMutation.mutateAsync({ ...editing, id: editing.id });
    } else {
      await createMutation.mutateAsync(editing);
    }
    setEditing(null);
  };

  const expiryBadge = (date: string | null) => {
    if (!date) return <span className="text-xs text-muted-foreground">No expiry</span>;
    const days = differenceInDays(new Date(date), new Date());
    if (days < 0) return <Badge variant="destructive">Expired</Badge>;
    if (days <= 30) return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">Expires in {days}d</Badge>;
    if (days <= 90) return <Badge variant="secondary">{days}d left</Badge>;
    return <span className="text-xs">{format(new Date(date), "MMM dd, yyyy")}</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage batches for <span className="font-medium text-foreground">{productName}</span>.
          Sales will pull earliest-expiring batches first (FEFO).
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add Batch
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch #</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Manufactured</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Cost</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
          ) : batches.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">
              No batches yet. Add one to start tracking expiry.
            </TableCell></TableRow>
          ) : (
            batches.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.batch_number}</TableCell>
                <TableCell>{b.locations?.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {b.manufacture_date ? format(new Date(b.manufacture_date), "MMM dd, yyyy") : "—"}
                </TableCell>
                <TableCell>{expiryBadge(b.expiry_date)}</TableCell>
                <TableCell className="text-right font-medium">{b.quantity}</TableCell>
                <TableCell className="text-right">{Number(b.unit_cost || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setEditing(b)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Delete batch "${b.batch_number}"?`)) deleteMutation.mutate(b.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Batch" : "Add Batch"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Batch Number *</Label>
                <Input
                  value={editing.batch_number || ""}
                  onChange={(e) => setEditing({ ...editing, batch_number: e.target.value })}
                  placeholder="e.g. LOT-2024-A1"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Location *</Label>
                <Select
                  value={editing.location_id || ""}
                  onValueChange={(v) => setEditing({ ...editing, location_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Manufacture Date</Label>
                <Input
                  type="date"
                  value={editing.manufacture_date || ""}
                  onChange={(e) => setEditing({ ...editing, manufacture_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={editing.expiry_date || ""}
                  onChange={(e) => setEditing({ ...editing, expiry_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editing.quantity ?? 0}
                  onChange={(e) => setEditing({ ...editing, quantity: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>Unit Cost</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editing.unit_cost ?? 0}
                  onChange={(e) => setEditing({ ...editing, unit_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Input
                  value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
              {editing.expiry_date && differenceInDays(new Date(editing.expiry_date), new Date()) < 0 && (
                <div className="col-span-2 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 text-xs">
                  <AlertTriangle className="h-4 w-4" />
                  This batch is already past its expiry date.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={
                !editing?.batch_number ||
                !editing?.location_id ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
