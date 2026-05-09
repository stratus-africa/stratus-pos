import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { usePurchases, type Purchase, type PurchaseItem } from "@/hooks/usePurchases";
import { PurchaseFormDialog } from "@/components/purchases/PurchaseFormDialog";
import { toast } from "sonner";

const Purchases = () => {
  const { query: purchasesQuery, createPurchase, updatePurchase, deletePurchase, getPurchaseItems } = usePurchases();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editingItems, setEditingItems] = useState<PurchaseItem[]>([]);

  const purchases = purchasesQuery.data || [];
  const filteredPurchases = purchases.filter((p) => {
    const matchSearch = (p.invoice_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.suppliers?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const formatKES = (n: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);

  const paymentBadge = (s: string) => {
    switch (s) {
      case "paid": return <Badge variant="default">Paid</Badge>;
      case "partial": return <Badge variant="secondary">Partial</Badge>;
      default: return <Badge variant="destructive">Unpaid</Badge>;
    }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "received": return <Badge variant="default">Received</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="secondary">Draft</Badge>;
    }
  };

  const handleEditPurchase = async (purchase: Purchase) => {
    try {
      const items = await getPurchaseItems(purchase.id);
      setEditingPurchase(purchase);
      setEditingItems(items);
      setPurchaseDialogOpen(true);
    } catch {
      toast.error("Failed to load purchase items");
    }
  };

  const handlePurchaseSubmit = (data: {
    purchase: {
      supplier_id: string | null;
      location_id: string;
      invoice_number?: string;
      subtotal: number;
      tax: number;
      total: number;
      payment_status: string;
      status: string;
      vat_enabled: boolean;
      notes?: string;
      created_by: string;
    };
    items: PurchaseItem[];
    paidThrough?: { bank_account_id: string; amount: number } | null;
  }) => {
    if (editingPurchase) {
      updatePurchase.mutate({ id: editingPurchase.id, purchase: data.purchase, items: data.items }, {
        onSuccess: () => {
          setPurchaseDialogOpen(false);
          setEditingPurchase(null);
          setEditingItems([]);
        },
      });
    } else {
      createPurchase.mutate({ purchase: data.purchase, items: data.items, paidThrough: data.paidThrough }, {
        onSuccess: () => setPurchaseDialogOpen(false),
      });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Purchases</h1>
        <Button size="sm" className="sm:size-default" onClick={() => { setEditingPurchase(null); setEditingItems([]); setPurchaseDialogOpen(true); }}>
          <Plus className="mr-1 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">New Purchase</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by invoice # or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {filteredPurchases.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No purchases yet. Create your first purchase order!</p>
            ) : (
              filteredPurchases.map((p) => (
                <div key={p.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{p.invoice_number || p.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.suppliers?.name || "—"} · {p.locations?.name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm">{formatKES(p.total)}</div>
                      <div className="flex gap-1 justify-end mt-1">{paymentBadge(p.payment_status)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {statusBadge(p.status)}
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEditPurchase(p)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete purchase {p.invoice_number || p.id.slice(0, 8)}?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deletePurchase.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No purchases yet. Create your first purchase order!</TableCell></TableRow>
                ) : (
                  filteredPurchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                      <TableCell className="font-medium">{p.invoice_number || p.id.slice(0, 8)}</TableCell>
                      <TableCell>{p.suppliers?.name || "—"}</TableCell>
                      <TableCell>{p.locations?.name || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatKES(p.total)}</TableCell>
                      <TableCell>{paymentBadge(p.payment_status)}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleEditPurchase(p)}><Pencil className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete purchase {p.invoice_number || p.id.slice(0, 8)}?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone. The purchase and all its line items will be permanently removed.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deletePurchase.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PurchaseFormDialog
        open={purchaseDialogOpen}
        onOpenChange={(o) => { setPurchaseDialogOpen(o); if (!o) { setEditingPurchase(null); setEditingItems([]); } }}
        onSubmit={handlePurchaseSubmit}
        isLoading={createPurchase.isPending || updatePurchase.isPending}
        editingPurchase={editingPurchase}
        editingItems={editingItems}
      />
    </div>
  );
};

export default Purchases;