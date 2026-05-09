import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, Plus, Search, AlertTriangle, ClipboardList } from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { StockAdjustmentDialog } from "@/components/inventory/StockAdjustmentDialog";

const Inventory = () => {
  const { locations, currentLocation } = useBusiness();
  const { user } = useAuth();
  const [locationFilter, setLocationFilter] = useState<string>(currentLocation?.id || "all");
  const [search, setSearch] = useState("");
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);

  const effectiveLocationId = locationFilter === "all" ? undefined : locationFilter;
  const { inventoryQuery, adjustStock, adjustmentsQuery } = useInventory(effectiveLocationId);

  const inventory = inventoryQuery.data || [];
  const adjustments = adjustmentsQuery.data || [];

  const filtered = inventory.filter((i) =>
    i.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.products?.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = inventory.filter((i) => i.quantity <= i.low_stock_threshold).length;

  const handleAdjust = (data: { items: { product_id: string; quantity_change: number }[]; location_id: string; reason: string; notes?: string }) => {
    if (!user) return;
    adjustStock.mutate({ ...data, created_by: user.id });
  };

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <Button onClick={() => setAdjDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Adjust Stock
        </Button>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">{lowStockCount} product{lowStockCount > 1 ? "s" : ""} below low stock threshold</span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock"><Warehouse className="mr-1 h-4 w-4" /> Stock Levels</TabsTrigger>
          <TabsTrigger value="adjustments"><ClipboardList className="mr-1 h-4 w-4" /> Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by product name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No inventory records. Adjust stock to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((i) => {
                      const isLow = i.quantity <= i.low_stock_threshold;
                      const isOut = i.quantity <= 0;
                      return (
                        <TableRow key={i.id} className={isLow ? "bg-destructive/5" : ""}>
                          <TableCell className="font-medium">{i.products?.name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{i.products?.sku || "—"}</TableCell>
                          <TableCell>{i.locations?.name || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{i.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{i.low_stock_threshold}</TableCell>
                          <TableCell className="text-right">{formatKES(i.quantity * (i.products?.selling_price || 0))}</TableCell>
                          <TableCell>
                            {isOut ? (
                              <Badge variant="destructive">Out of Stock</Badge>
                            ) : isLow ? (
                              <Badge variant="secondary" className="bg-accent text-accent-foreground">Low Stock</Badge>
                            ) : (
                              <Badge variant="default">In Stock</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Stock Adjustments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No adjustments yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    adjustments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell className="font-medium">{a.products?.name || "—"}</TableCell>
                        <TableCell>{a.locations?.name || "—"}</TableCell>
                        <TableCell className={`text-right font-medium ${a.quantity_change > 0 ? "text-green-600" : "text-destructive"}`}>
                          {a.quantity_change > 0 ? "+" : ""}{a.quantity_change}
                        </TableCell>
                        <TableCell>{a.reason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StockAdjustmentDialog
        open={adjDialogOpen}
        onOpenChange={setAdjDialogOpen}
        onSubmit={handleAdjust}
        isLoading={adjustStock.isPending}
      />
    </div>
  );
};

export default Inventory;
