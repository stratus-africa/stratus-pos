import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Pencil, Trash2, Eye, Download, FileSpreadsheet, CheckCircle2, XCircle, RotateCcw, MoreVertical } from "lucide-react";
import { usePurchases, type Purchase } from "@/hooks/usePurchases";
import { useSupplierPayments } from "@/hooks/useSupplierPayments";
import { SupplierPaymentDialog } from "@/components/purchases/SupplierPaymentDialog";
import { PurchaseDetailDialog } from "@/components/purchases/PurchaseDetailDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { exportPurchasesToExcel } from "@/lib/purchaseExport";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

const Purchases = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("purchases.edit");
  const canDelete = hasPermission("purchases.delete");
  const canCreate = hasPermission("purchases.create");
  const { query: purchasesQuery, deletedQuery, deletePurchase, restorePurchase, purgePurchase } = usePurchases();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const { query: paymentsQuery, remove: removePayment } = useSupplierPayments();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const payments = paymentsQuery.data || [];

  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);

  const exportCsv = () => {
    const headers = ["Date", "Invoice #", "Supplier", "Location", "Subtotal", "VAT", "Total", "Payment", "Status"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filteredPurchases.map((p) => [
      format(new Date(p.created_at), "yyyy-MM-dd"),
      p.invoice_number || p.id.slice(0, 8),
      p.suppliers?.name || "",
      p.locations?.name || "",
      Number(p.subtotal || 0).toFixed(2),
      Number(p.tax || 0).toFixed(2),
      Number(p.total || 0).toFixed(2),
      p.payment_status,
      p.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchases-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Bulk selection ----
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectedPurchases = filteredPurchases.filter((p) => selected.includes(p.id));
  const allSelected = filteredPurchases.length > 0 && selectedPurchases.length === filteredPurchases.length;

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((s) => (checked ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  const toggleAll = (checked: boolean) => setSelected(checked ? filteredPurchases.map((p) => p.id) : []);

  const bulkSetStatus = async (status: "received" | "cancelled" | "draft") => {
    setBulkBusy(true);
    try {
      for (const p of selectedPurchases) {
        if (p.status === status) continue;
        const { error } = await supabase.from("purchases").update({ status }).eq("id", p.id);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`${selectedPurchases.length} purchase(s) marked ${status}`);
      setSelected([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    setBulkBusy(true);
    try {
      for (const p of selectedPurchases) {
        await deletePurchase.mutateAsync(p.id);
      }
      setSelected([]);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Purchases</h1>
      </div>

      <Tabs defaultValue="orders" className="space-y-3">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="deleted">
            Deleted{(deletedQuery.data?.length || 0) > 0 ? ` (${deletedQuery.data?.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={filteredPurchases.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportPurchasesToExcel(filteredPurchases)} disabled={filteredPurchases.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => navigate("/purchases/new")}>
                <Plus className="mr-2 h-4 w-4" /> New Purchase
              </Button>
            )}
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">{selected.length} selected</span>
              <div className="flex-1" />
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => exportPurchasesToExcel(selectedPurchases, `purchases-selected-${format(new Date(), "yyyy-MM-dd")}.xlsx`)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
              </Button>
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkSetStatus("received")}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Received
                  </Button>
                  <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkSetStatus("cancelled")}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                </>
              )}
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={bulkBusy}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selected.length} purchase(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Received stock will be removed from inventory. You can restore these purchases later from the Deleted tab.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
            </div>
          )}


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
                    <div className="flex min-w-0 gap-2">
                      <Checkbox className="mt-1" checked={selected.includes(p.id)} onCheckedChange={(c) => toggleOne(p.id, !!c)} aria-label="Select purchase" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.invoice_number || p.id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground truncate">{p.suppliers?.name || "—"} · {p.locations?.name || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm">{formatKES(p.total)}</div>
                      <div className="flex gap-1 justify-end mt-1">{paymentBadge(p.payment_status)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {statusBadge(p.status)}
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewing(p)}><Eye className="h-4 w-4" /></Button>
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(`/purchases/${p.id}/edit`)}><Pencil className="h-4 w-4" /></Button>
                      )}
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete purchase {p.invoice_number || p.id.slice(0, 8)}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {p.status === "received" ? "Stock added by this purchase will be removed from inventory. " : ""}
                                You can restore it later from the Deleted tab.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deletePurchase.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
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
                  <TableHead className="w-[40px]">
                    <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(!!c)} aria-label="Select all purchases" />
                  </TableHead>
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
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No purchases yet. Create your first purchase order!</TableCell></TableRow>
                ) : (
                  filteredPurchases.map((p) => (
                    <TableRow key={p.id} data-state={selected.includes(p.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox checked={selected.includes(p.id)} onCheckedChange={(c) => toggleOne(p.id, !!c)} aria-label="Select purchase" />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>

                      <TableCell className="font-medium">{p.invoice_number || p.id.slice(0, 8)}</TableCell>
                      <TableCell>{p.suppliers?.name || "—"}</TableCell>
                      <TableCell>{p.locations?.name || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatKES(p.total)}</TableCell>
                      <TableCell>{paymentBadge(p.payment_status)}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setViewing(p)}><Eye className="h-4 w-4" /></Button>
                          {canEdit && (
                            <Button size="icon" variant="ghost" onClick={() => navigate(`/purchases/${p.id}/edit`)}><Pencil className="h-4 w-4" /></Button>
                          )}
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete purchase {p.invoice_number || p.id.slice(0, 8)}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {p.status === "received" ? "Stock added by this purchase will be removed from inventory. " : ""}
                                    Any linked supplier payments will be deleted and the bank balance restored.
                                    {p.status !== "cancelled" && " If you only want to undo the stock effect, use Cancel Purchase from the edit page instead."}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deletePurchase.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
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
        </TabsContent>

        <TabsContent value="payments" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice / Purchase</TableHead>
                    <TableHead>Paid From</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No supplier payments yet.</TableCell></TableRow>
                  ) : payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{format(new Date(p.date), "dd MMM yyyy")}</TableCell>
                      <TableCell>{p.suppliers?.name || p.contact_name || "—"}</TableCell>
                      <TableCell>{p.purchases?.invoice_number || (p.purchase_id ? p.purchase_id.slice(0, 8) : "—")}</TableCell>
                      <TableCell>{p.bank_accounts?.name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.reference || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatKES(Number(p.amount))}</TableCell>
                      <TableCell>
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                                <AlertDialogDescription>The bank balance will be restored and any linked purchase will be re-evaluated.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removePayment.mutate(p)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deleted" className="space-y-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deleted</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[150px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(deletedQuery.data || []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nothing here. Deleted purchases can be restored from this tab.</TableCell></TableRow>
                  ) : (deletedQuery.data || []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground">{p.deleted_at ? format(new Date(p.deleted_at), "dd MMM yyyy HH:mm") : "—"}</TableCell>
                      <TableCell className="font-medium">{p.invoice_number || p.id.slice(0, 8)}</TableCell>
                      <TableCell>{p.suppliers?.name || "—"}</TableCell>
                      <TableCell>{p.locations?.name || "—"}</TableCell>
                      <TableCell className="text-right">{formatKES(p.total)}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => restorePurchase.mutate(p.id)}>
                              <RotateCcw className="mr-2 h-4 w-4" /> Restore
                            </Button>
                          )}
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Permanently delete {p.invoice_number || p.id.slice(0, 8)}?</AlertDialogTitle>
                                  <AlertDialogDescription>This cannot be undone and the purchase can no longer be restored.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => purgePurchase.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete forever</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <SupplierPaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} />

      <PurchaseDetailDialog
        purchase={viewing}
        open={!!viewing}
        onOpenChange={(o) => { if (!o) setViewing(null); }}
        onEdit={canEdit ? (p) => { setViewing(null); navigate(`/purchases/${p.id}/edit`); } : undefined}
      />
    </div>
  );
};

export default Purchases;