import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { usePurchases, useSuppliers, type Purchase, type Supplier } from "@/hooks/usePurchases";
import { usePermissions } from "@/hooks/usePermissions";
import { SupplierFormDialog } from "@/components/purchases/SupplierFormDialog";
import { PurchaseDetailDialog } from "@/components/purchases/PurchaseDetailDialog";

const Suppliers = () => {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("suppliers.create");
  const canEdit = hasPermission("suppliers.edit");
  const canDelete = hasPermission("suppliers.delete");
  const { query, create, update, remove } = useSuppliers();
  const { query: purchasesQuery } = usePurchases();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);

  const suppliers = query.data ?? [];
  const filtered = suppliers.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || "").includes(search),
  );
  const totalOutstanding = suppliers.reduce((sum, supplier) => sum + Math.max(0, Number(supplier.balance || 0)), 0);
  const supplierPurchases = viewing
    ? (purchasesQuery.data || []).filter((purchase) => purchase.supplier_id === viewing.id)
    : [];

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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                {(canEdit || canDelete) && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No suppliers yet.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewing(s)}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell>{s.email || "—"}</TableCell>
                    <TableCell className="text-right">{formatKES(s.balance)}</TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(s);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => remove.mutate(s.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
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
