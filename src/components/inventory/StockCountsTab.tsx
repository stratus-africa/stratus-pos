import { useMemo, useRef, useState } from "react";
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
import { Camera, ClipboardCheck, History, Lock, Plus, ScanLine, Search, Trash2 } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";
import { parseBarcode } from "@/lib/barcodeScan";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useProducts, useCategories } from "@/hooks/useProducts";
import { useStockCounts, useStockCountEvents, type StockCount, type StockCountStatus } from "@/hooks/useStockCounts";
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
  const { locations, currentLocation, userRole, business } = useBusiness();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { productsQuery } = useProducts();
  const { query: categoriesQuery } = useCategories();
  const {
    countsQuery, assigneesQuery, createCount,
    addItems, saveCounts,
    submitCount, approveCount, rejectCount, deleteCount,
  } = useStockCounts();

  const isApprover = hasPermission("stock_take.delete") || userRole === "admin";
  const canCreate = hasPermission("stock_take.create") || isApprover;
  const canEdit = hasPermission("stock_take.edit") || isApprover;
  const lockApproved =
    (business as { lock_approved_stock_counts?: boolean } | null)?.lock_approved_stock_counts ?? true;

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
  const [categoryId, setCategoryId] = useState<string>("all");

  const categories = (categoriesQuery.data ?? []) as { id: string; name: string }[];

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!q) return true;
      const codes = parseBarcode(q).candidates.map((c) => c.toLowerCase());
      const bc = (p.barcode || "").toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (!!bc && (bc.includes(q) || codes.includes(bc)))
      );
    });
  }, [products, productSearch, categoryId]);

  const resetForm = () => {
    setLocationId(currentLocation?.id ?? "");
    setReference("");
    setAssignedTo("none");
    setNotes("");
    setProductSearch("");
    setCategoryId("all");
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
  const canDelete = (c: StockCount) =>
    isApprover && !(c.status === "approved" && lockApproved);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Stock Takes
          </CardTitle>
          {canCreate && (
            <Button size="sm" className="w-full sm:w-auto" onClick={() => { resetForm(); setNewOpen(true); }}>
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
            <>
              {/* Mobile: card list */}
              <div className="space-y-2 md:hidden">
                {counts.map((c) => (
                  <div key={c.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.reference || c.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {locationName(c.location_id)} · {c.stock_count_items?.length ?? 0} items
                        </p>
                      </div>
                      <Badge variant={statusMeta[c.status]?.variant ?? "outline"}>
                        {statusMeta[c.status]?.label ?? c.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{nameOf(c.assigned_to)}</span>
                      <span>{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setOpenCount(c)}>Open</Button>
                      {canDelete(c) && (
                        <Button size="icon" variant="ghost" onClick={() => deleteCount.mutate(c.id)} aria-label="Delete stock count">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
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
                          {canDelete(c) && (
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
            </>
          )}
        </CardContent>
      </Card>

      {/* New stock count */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Label>Products ({selected.size} selected)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button" size="sm" variant="outline" className="flex-1 sm:flex-none"
                  onClick={() => setSelected(new Set(filteredProducts.map((p) => p.id)))}
                >
                  Select all shown
                </Button>
                <Button
                  type="button" size="sm" variant="outline" className="flex-1 sm:flex-none"
                  disabled={categoryId === "all"}
                  onClick={() => setSelected((prev) => {
                    const next = new Set(prev);
                    products.filter((p) => p.category_id === categoryId).forEach((p) => next.add(p.id));
                    return next;
                  })}
                >
                  Add category
                </Button>
                <Button type="button" size="sm" variant="ghost" className="flex-1 sm:flex-none" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8" placeholder="Search products…"
                value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <div className="max-h-52 sm:max-h-64 overflow-y-auto rounded-md border divide-y">
              {filteredProducts.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer">
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleProduct(p.id)} />
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{p.sku}</span>
                </label>
              ))}
              {filteredProducts.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">No products match.</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={handleCreate} disabled={createCount.isPending}>
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
          canEdit={canEdit}
          lockApproved={lockApproved}
          isAssignee={openCount.assigned_to === user?.id}
          allProducts={products}
          categories={categories}
          onAddProducts={(ids) => addItems.mutate({ countId: openCount.id, locationId: openCount.location_id, productIds: ids })}
          addingProducts={addItems.isPending}
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
  canEdit: boolean;
  lockApproved: boolean;
  isAssignee: boolean;
  allProducts: { id: string; name: string; sku: string | null; barcode?: string | null; category_id: string | null }[];
  categories: { id: string; name: string }[];
  onAddProducts: (ids: string[]) => void;
  addingProducts: boolean;
  onSave: (items: { id: string; counted_qty: number | null; notes?: string | null }[]) => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  saving: boolean;
}

function StockCountDetailDialog({
  count, open, onOpenChange, isApprover, canEdit, lockApproved, isAssignee,
  allProducts, categories, onAddProducts, addingProducts,
  onSave, onSubmit, onApprove, onReject, saving,
}: DetailProps) {
  const items = count.stock_count_items ?? [];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.counted_qty === null ? "" : String(i.counted_qty)])),
  );
  const [rejectReason, setRejectReason] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState("all");
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [scanValue, setScanValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const eventsQuery = useStockCountEvents(showHistory ? count.id : null);



  const approvedLocked = count.status === "approved" && lockApproved;
  const editable =
    !approvedLocked
    && (count.status === "draft" || count.status === "assigned" || count.status === "rejected"
        || (count.status === "approved" && isApprover))
    && (isAssignee || canEdit);

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

  const existingProductIds = new Set(items.map((i) => i.product_id));
  const addCandidates = allProducts.filter((p) => {
    if (existingProductIds.has(p.id)) return false;
    if (addCategory !== "all" && p.category_id !== addCategory) return false;
    const q = addSearch.trim().toLowerCase();
    if (!q) return true;
    const codes = parseBarcode(q).candidates.map((c) => c.toLowerCase());
    const bc = (p.barcode || "").toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (!!bc && (bc.includes(q) || codes.includes(bc)))
    );
  });

  /** Match a scanned code against barcode/SKU and queue the product for adding. */
  const handleScan = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const candidates = parseBarcode(code).candidates.map((c) => c.toLowerCase());
    const match = allProducts.find((p) => {
      const bc = (p.barcode || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      return (bc && candidates.includes(bc)) || (sku && candidates.includes(sku));
    });
    setScanValue("");
    if (!match) {
      toast.error(`No product matches "${code}"`);
      return;
    }
    if (existingProductIds.has(match.id)) {
      toast.info(`${match.name} is already on this sheet`);
      return;
    }
    setAddSelected((prev) => new Set(prev).add(match.id));
    toast.success(`${match.name} queued`);
  };

  const varianceClass = (variance: number | null) =>
    variance === null ? "" : variance < 0 ? "text-destructive" : variance > 0 ? "text-emerald-600" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{count.reference || "Stock count"}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1">
            {statusMeta[count.status]?.label ?? count.status}
            {count.rejection_reason ? ` — ${count.rejection_reason}` : ""}
            {approvedLocked && (
              <span className="inline-flex items-center gap-1 text-xs">
                <Lock className="h-3 w-3" /> locked
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {editable && canEdit && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Add more products</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddOpen((v) => !v)}>
                {addOpen ? "Close" : "Add products"}
              </Button>
            </div>
            {addOpen && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ScanLine className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={scanRef}
                      autoFocus
                      className="pl-8"
                      placeholder="Scan barcode…"
                      value={scanValue}
                      onChange={(e) => setScanValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleScan(scanValue);
                        }
                      }}
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" onClick={() => setCameraOpen(true)} aria-label="Scan with camera">
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Select value={addCategory} onValueChange={setAddCategory}>
                    <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Search products…" value={addSearch} onChange={(e) => setAddSearch(e.target.value)} />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border divide-y">
                  {addCandidates.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={addSelected.has(p.id)}
                        onCheckedChange={() => setAddSelected((prev) => {
                          const next = new Set(prev);
                          next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                          return next;
                        })}
                      />
                      <span className="flex-1 min-w-0 truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{p.sku}</span>
                    </label>
                  ))}
                  {addCandidates.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground text-center">No more products to add.</p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm" variant="outline" disabled={addCategory === "all"}
                    onClick={() => setAddSelected((prev) => {
                      const next = new Set(prev);
                      addCandidates.filter((p) => p.category_id === addCategory).forEach((p) => next.add(p.id));
                      return next;
                    })}
                  >
                    Select category
                  </Button>
                  <Button
                    size="sm" disabled={addSelected.size === 0 || addingProducts}
                    onClick={() => { onAddProducts(Array.from(addSelected)); setAddSelected(new Set()); }}
                  >
                    {addingProducts ? "Adding…" : `Add ${addSelected.size || ""}`.trim()}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <BarcodeScanner
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onDetected={(code) => { setCameraOpen(false); handleScan(code); }}
        />



        {/* Mobile: stacked rows */}
        <div className="space-y-2 md:hidden max-h-[45vh] overflow-y-auto">
          {items.map((i) => {
            const raw = values[i.id];
            const variance = raw === "" || raw === undefined ? null : Number(raw) - Number(i.expected_qty);
            return (
              <div key={i.id} className="rounded-md border p-3 space-y-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{i.products?.name ?? "Product"}</p>
                  {i.products?.sku && <p className="text-xs text-muted-foreground">{i.products.sku}</p>}
                </div>
                <div className="flex items-end gap-3">
                  <div className="text-xs text-muted-foreground">
                    Expected<br />
                    <span className="text-sm text-foreground font-medium">{Number(i.expected_qty)}</span>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Counted</Label>
                    {editable ? (
                      <Input
                        type="number" inputMode="decimal" className="h-9"
                        value={raw ?? ""}
                        onChange={(e) => setValues((p) => ({ ...p, [i.id]: e.target.value }))}
                      />
                    ) : (
                      <p className="text-sm font-medium">{i.counted_qty ?? "—"}</p>
                    )}
                  </div>
                  <div className={`text-xs text-muted-foreground text-right ${varianceClass(variance)}`}>
                    Variance<br />
                    <span className="text-sm font-medium">
                      {variance === null ? "—" : variance > 0 ? `+${variance}` : variance}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block max-h-[55vh] overflow-y-auto rounded-md border">
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
                    <TableCell className={`text-right ${varianceClass(variance)}`}>
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

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Audit trail</Label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Hide" : "Show history"}
            </Button>
          </div>
          {showHistory && (
            <div className="max-h-56 overflow-y-auto divide-y text-sm">
              {eventsQuery.isLoading && <p className="py-3 text-muted-foreground text-center">Loading…</p>}
              {!eventsQuery.isLoading && (eventsQuery.data ?? []).length === 0 && (
                <p className="py-3 text-muted-foreground text-center">No activity recorded yet.</p>
              )}
              {(eventsQuery.data ?? []).map((ev) => {
                const productName =
                  items.find((i) => i.id === ev.item_id)?.products?.name
                  ?? allProducts.find((p) => p.id === ev.product_id)?.name;
                const label =
                  ev.action === "qty_changed"
                    ? `Counted qty for ${productName ?? "product"}: ${ev.old_value ?? "—"} → ${ev.new_value ?? "—"}`
                    : ev.action === "status_changed"
                      ? `Status ${ev.old_value} → ${ev.new_value}${ev.note ? ` (${ev.note})` : ""}`
                      : ev.action === "assigned"
                        ? "Assignment changed"
                        : ev.action === "item_added"
                          ? `Added ${productName ?? "product"} to the sheet`
                          : ev.action === "item_removed"
                            ? `Removed ${productName ?? "product"} from the sheet`
                            : `Sheet created (${ev.new_value})`;
                return (
                  <div key={ev.id} className="py-2 flex items-start justify-between gap-3">
                    <span className="min-w-0">{label}</span>
                    <span className="text-xs text-muted-foreground shrink-0 text-right">
                      {ev.user_name || "System"}<br />
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>



        {count.status === "submitted" && isApprover && (
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (required to send back)</Label>
            <Input id="reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {editable && count.status !== "approved" && (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => onSave(payload())} disabled={saving}>Save progress</Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => { onSave(payload()); onSubmit(); }}
                disabled={saving}
              >
                Submit for approval
              </Button>
            </>
          )}
          {editable && count.status === "approved" && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => onSave(payload())} disabled={saving}>
              Save changes
            </Button>
          )}
          {count.status === "submitted" && isApprover && (
            <>
              <Button
                variant="outline" className="w-full sm:w-auto"
                onClick={() => rejectReason.trim() ? onReject(rejectReason.trim()) : toast.error("Add a reason")}
                disabled={saving}
              >
                Send back
              </Button>
              <Button className="w-full sm:w-auto" onClick={onApprove} disabled={saving}>Approve &amp; adjust stock</Button>
            </>
          )}
          {!editable && count.status !== "submitted" && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
