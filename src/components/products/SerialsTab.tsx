import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useProductSerials, useCreateProductSerial, useUpdateProductSerial, useDeleteProductSerial, type ProductSerial } from "@/hooks/useProductSerials";

export default function SerialsTab({ productId, productName }: { productId: string; productName: string }) {
  const { locations, currentLocation } = useBusiness();
  const { data: serials = [], isLoading } = useProductSerials(productId);
  const create = useCreateProductSerial();
  const update = useUpdateProductSerial();
  const remove = useDeleteProductSerial();
  const [editing, setEditing] = useState<Partial<ProductSerial> | null>(null);

  const save = async () => {
    if (!editing?.serial_number?.trim()) return;
    if (editing.id) await update.mutateAsync({ id: editing.id, product_id: productId, serial_number: editing.serial_number.trim(), status: editing.status, location_id: editing.location_id ?? null, notes: editing.notes ?? null });
    else await create.mutateAsync({ product_id: productId, serial_number: editing.serial_number.trim(), status: (editing.status as ProductSerial["status"]) ?? "available", location_id: editing.location_id ?? currentLocation?.id ?? null, notes: editing.notes ?? null });
    setEditing(null);
  };

  return <div className="space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">Serial tracking for <span className="font-medium text-foreground">{productName}</span>.</p>
      <Button size="sm" onClick={() => setEditing({ serial_number: "", status: "available", location_id: currentLocation?.id ?? null })}><Plus className="h-4 w-4 mr-1" /> Add Serial</Button>
    </div>
    <Table>
      <TableHeader><TableRow><TableHead>Serial</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
      <TableBody>{isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-6">Loading…</TableCell></TableRow> : serials.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No serial numbers recorded.</TableCell></TableRow> : serials.map(s => <TableRow key={s.id}><TableCell className="font-mono text-sm">{s.serial_number}</TableCell><TableCell>{s.locations?.name ?? "—"}</TableCell><TableCell><Badge variant={s.status === "available" ? "default" : s.status === "sold" ? "secondary" : "outline"}>{s.status}</Badge></TableCell><TableCell className="text-muted-foreground">{s.notes || "—"}</TableCell><TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => { if (confirm(`Remove serial ${s.serial_number}?`)) remove.mutate({ id: s.id, product_id: productId }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell></TableRow>)}</TableBody>
    </Table>
    <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>{editing?.id ? "Edit Serial" : "Add Serial"}</DialogTitle></DialogHeader>{editing && <div className="space-y-3"><div className="space-y-1"><Label>Serial Number *</Label><Input value={editing.serial_number ?? ""} onChange={e => setEditing({ ...editing, serial_number: e.target.value })} /></div><div className="space-y-1"><Label>Location</Label><Select value={editing.location_id ?? "none"} onValueChange={v => setEditing({ ...editing, location_id: v === "none" ? null : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No location</SelectItem>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Status</Label><Select value={editing.status ?? "available"} onValueChange={v => setEditing({ ...editing, status: v as ProductSerial["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["available","sold","reserved","damaged","returned","retired"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Notes</Label><Input value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} disabled={!editing?.serial_number?.trim() || create.isPending || update.isPending}>Save</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
