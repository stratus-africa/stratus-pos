import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Pencil, Trash2, MoreHorizontal, Eye, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePurchases, useSuppliers, type Purchase, type Supplier } from "@/hooks/usePurchases";
import { usePermissions } from "@/hooks/usePermissions";
import { SupplierFormDialog } from "@/components/purchases/SupplierFormDialog";
import { PurchaseDetailDialog } from "@/components/purchases/PurchaseDetailDialog";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Suppliers = () => {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("suppliers.create");
  const canEdit = hasPermission("suppliers.edit");
  const canDelete = hasPermission("suppliers.delete");
  const { query, create, update, remove } = useSuppliers();
  const queryClient = useQueryClient();
  const { query: purchasesQuery } = usePurchases();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<"name" | "balance">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const suppliers = query.data ?? [];
  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone || "").includes(search) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase()),
  );
  const sortedSuppliers = [...filtered].sort((a, b) => {
    const comparison =
      sortKey === "name"
        ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        : Number(a.balance || 0) - Number(b.balance || 0);
    return sortDirection === "asc" ? comparison : -comparison;
  });
  const toggleSort = (key: "name" | "balance") => {
    if (sortKey === key) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };
  const totalOutstanding = suppliers.reduce((sum, supplier) => sum + Math.max(0, Number(supplier.balance || 0)), 0);
  const supplierPurchases = viewing
    ? (purchasesQuery.data || []).filter((purchase) => purchase.supplier_id === viewing.id)
    : [];
  const selectedSuppliers = filtered.filter((supplier) => selected.includes(supplier.id));
  const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase().replace(/\s+/g, "");
  const allSelected = filtered.length > 0 && filtered.every((supplier) => selected.includes(supplier.id));
  const toggleSelected = (id: string, checked: boolean) =>
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));

  const mergeSelected = async () => {
    if (selectedSuppliers.length < 2) return;
    const [primary, ...duplicates] = selectedSuppliers;
    const matches = selectedSuppliers.every(
      (supplier) =>
        normalize(supplier.name) === normalize(primary.name) && normalize(supplier.phone) === normalize(primary.phone),
    );
    if (!matches) {
      toast.error("Suppliers can only be merged when both name and phone number match.");
      return;
    }
    try {
      const duplicateIds = duplicates.map((supplier) => supplier.id);
      await Promise.all([
        supabase.from("purchases").update({ supplier_id: primary.id }).in("supplier_id", duplicateIds),
        supabase.from("bank_transactions").update({ supplier_id: primary.id }).in("supplier_id", duplicateIds),
      ]);
      const combinedBalance = selectedSuppliers.reduce((sum, supplier) => sum + Number(supplier.balance || 0), 0);
      const { error: balanceError } = await supabase
        .from("suppliers")
        .update({ balance: combinedBalance })
        .eq("id", primary.id);
      if (balanceError) throw balanceError;
      const { error: deleteError } = await supabase.from("suppliers").delete().in("id", duplicateIds);
      if (deleteError) throw deleteError;
      setSelected([]);
      await Promise.all(
        ["suppliers", "purchases", "supplier_payments", "bank_transactions"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      toast.success("Duplicate suppliers merged.");
    } catch (error: any) {
      toast.error(error.message || "Could not merge suppliers.");
    }
  };

  const deleteSelected = async () => {
    if (!selectedSuppliers.length) return;
    try {
      await Promise.all(selectedSuppliers.map((supplier) => remove.mutateAsync(supplier.id)));
      setSelected([]);
    } catch {
      /* individual mutation messages explain the failure */
    }
  };

  const formatKES = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        {canCreate && (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Supplier
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search suppliers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="max-w-sm">
        <CardContent className="pt-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Outstanding Balance</p>
          <p className="mt-1 text-2xl font-bold">{formatKES(totalOutstanding)}</p>
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <div className="flex-1" />
          {canEdit && (
            <Button size="sm" variant="outline" onClick={mergeSelected} disabled={selected.length < 2}>
              Merge
            </Button>
          )}
          {canDelete && (
            <Button size="sm" variant="destructive" onClick={deleteSelected}>
              Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => setSelected(checked ? filtered.map((supplier) => supplier.id) : [])}
                    aria-label="Select all suppliers"
                  />
                </TableHead>
                <TableHead
                  aria-sort={sortKey === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("name")}
                  >
                    Supplier Name
                    {sortKey === "name" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead
                  className="text-right"
                  aria-sort={sortKey === "balance" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort("balance")}
                  >
                    Balance
                    {sortKey === "balance" ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                sortedSuppliers.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewing(s)}>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(s.id)}
                        onCheckedChange={(checked) => toggleSelected(s.id, !!checked)}
                        aria-label={`Select ${s.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{s.email || "—"}</TableCell>
                    <TableCell className="text-right">{formatKES(s.balance)}</TableCell>
                    {
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Supplier actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewing(s)}>
                              <Eye className="mr-2 h-4 w-4" /> View
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(s);
                                  setOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem className="text-destructive" onClick={() => remove.mutate(s.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    }
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SupplierFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        supplier={editing}
        isLoading={create.isPending || update.isPending}
        onSubmit={(data) => {
          if (editing) {
            update.mutate({ id: editing.id, ...data });
          } else {
            create.mutate(data);
          }
          setEditing(null);
          setOpen(false);
        }}
        isPhoneDuplicate={(phone) =>
          suppliers.some((supplier) => supplier.id !== editing?.id && normalize(supplier.phone) === normalize(phone))
        }
      />

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>Supplier account and purchase history</DialogDescription>
          </DialogHeader>
          {viewing && (
            <Tabs defaultValue="details" className="space-y-4">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="transactions">Transaction History</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p>{viewing.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p>{viewing.email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">KRA PIN</p>
                  <p>{viewing.kra_pin || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Outstanding Balance</p>
                  <p className="font-semibold">{formatKES(Number(viewing.balance || 0))}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Address</p>
                  <p>{viewing.address || "—"}</p>
                </div>
              </TabsContent>
              <TabsContent value="transactions">
                <div className="max-h-[45vh] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierPurchases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            No purchases from this supplier.
                          </TableCell>
                        </TableRow>
                      ) : (
                        supplierPurchases.map((purchase) => (
                          <TableRow
                            key={purchase.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setViewingPurchase(purchase)}
                          >
                            <TableCell>{new Date(purchase.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>{purchase.invoice_number || purchase.id.slice(0, 8)}</TableCell>
                            <TableCell className="capitalize">{purchase.status}</TableCell>
                            <TableCell className="capitalize">{purchase.payment_status}</TableCell>
                            <TableCell className="text-right">{formatKES(Number(purchase.total || 0))}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <PurchaseDetailDialog
        purchase={viewingPurchase}
        open={!!viewingPurchase}
        onOpenChange={(open) => !open && setViewingPurchase(null)}
      />
    </div>
  );
};

export default Suppliers;
