import { useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useExpiringBatches, useCreateBatch, useUpdateBatch, useDeleteBatch } from "@/hooks/useProductBatches";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function BatchManagementTab() {
  const { business, currentLocation } = useBusiness();
  const { hasPermission } = usePermissions();
  const canView = hasPermission("inventory.view_batches");
  const canManage = hasPermission("inventory.manage_batches");
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [expiry, setExpiry] = useState("");
  const [manufacture, setManufacture] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const create = useCreateBatch(); const update = useUpdateBatch(); const remove = useDeleteBatch();

  const products = useQuery({ queryKey: ["batch-products", business?.id], queryFn: async () => { if (!business?.id) return []; const { data, error } = await supabase.from("products").select("id,name,sku").eq("business_id", business.id).eq("is_active", true).order("name"); if (error) throw error; return data ?? []; }, enabled: !!business?.id });
  const batches = useQuery({ queryKey: ["inventory-batches", business?.id, currentLocation?.id], queryFn: async () => { if (!business?.id) return []; let q = supabase.from("product_batches" as any).select("*, products(name,sku)").eq("business_id", business.id).eq("is_active", true).order("expiry_date", { ascending: true, nullsFirst: false }); if (currentLocation?.id) q = q.eq("location_id", currentLocation.id); const { data, error } = await q; if (error) throw error; return data ?? []; }, enabled: !!business?.id && canView });

  if (!canView) return <Card><CardContent className="py-8 text-sm text-muted-foreground">You do not have permission to view batches.</CardContent></Card>;
  const reset = () => { setOpen(false); setEditingId(null); setProductId(""); setBatchNumber(""); setQuantity(""); setUnitCost(""); setExpiry(""); setManufacture(""); };
  const save = async () => { if (!currentLocation?.id || !productId || !batchNumber || !Number(quantity)) return toast.error("Product, batch number and quantity are required"); const payload: any = { product_id: productId, location_id: currentLocation.id, batch_number: batchNumber.trim(), quantity: Number(quantity), unit_cost: Number(unitCost) || 0, expiry_date: expiry || null, manufacture_date: manufacture || null, is_active: true }; try { if (editingId) await update.mutateAsync({ id: editingId, ...payload }); else await create.mutateAsync(payload); await batches.refetch(); reset(); } catch { /* hook displays error */ } };
  const startEdit = (b: any) => { setEditingId(b.id); setProductId(b.product_id); setBatchNumber(b.batch_number); setQuantity(String(b.quantity)); setUnitCost(String(b.unit_cost)); setExpiry(b.expiry_date || ""); setManufacture(b.manufacture_date || ""); setOpen(true); };

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h3 className="font-semibold">Batch Management</h3><p className="text-sm text-muted-foreground">Track quantities and expiry by batch.</p></div>{canManage && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><PackagePlus className="mr-2 h-4 w-4" /> Add Batch</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{editingId ? "Edit Batch" : "Add Batch"}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Product</Label><Select value={productId} onValueChange={setProductId}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{(products.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ""}</SelectItem>)}</SelectContent></Select></div><div><Label>Batch Number</Label><Input value={batchNumber} onChange={e => setBatchNumber(e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} /></div><div><Label>Unit Cost</Label><Input type="number" min="0" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div></div><div className="grid grid-cols-2 gap-3"><div><Label>Manufacture Date</Label><Input type="date" value={manufacture} onChange={e => setManufacture(e.target.value)} /></div><div><Label>Expiry Date</Label><Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div></div><Button className="w-full" onClick={save} disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Batch</Button></div></DialogContent></Dialog>}</div>
    <Card><CardHeader><CardTitle className="text-base">Active Batches</CardTitle></CardHeader><CardContent><div className="space-y-2">{(batches.data ?? []).map((b: any) => { const expired = b.expiry_date && new Date(b.expiry_date) < new Date(); return <div key={b.id} className="flex items-center justify-between gap-3 border rounded-lg p-3"><div><div className="flex items-center gap-2"><span className="font-medium">{b.products?.name || "Product"}</span><Badge variant={expired ? "destructive" : "secondary"}>{b.batch_number}</Badge></div><p className="text-xs text-muted-foreground">Qty {b.quantity} · Cost {Number(b.unit_cost || 0).toLocaleString("en-KE", { style: "currency", currency: "KES" })}{b.expiry_date ? ` · Exp ${b.expiry_date}` : ""}</p></div>{canManage && <div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => startEdit(b)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={async () => { if (confirm("Delete this batch?")) { await remove.mutateAsync(b.id); await batches.refetch(); } }}><Trash2 className="h-4 w-4" /></Button></div>}</div>})}{!(batches.data ?? []).length && <p className="text-sm text-muted-foreground">No batches found.</p>}</div></CardContent></Card>
  </div>;
}
