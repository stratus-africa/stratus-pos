import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Eye, Trash2, Ban, RotateCcw, Pause, Play, X } from "lucide-react";
import { useSales, Sale } from "@/hooks/useSales";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import SaleDetailDialog from "@/components/sales/SaleDetailDialog";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Sales = () => {
  const { salesQuery, deleteSale, cancelSale } = useSales();
  const { business, userRole } = useBusiness();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isCashier = userRole === "cashier";
  const canDelete = hasPermission("sales.delete") && !isCashier;
  const canCancel = !isCashier;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = Number(localStorage.getItem("sales_page_size"));
    return [25, 50, 100, 200].includes(saved) ? saved : 25;
  });
  const [page, setPage] = useState(1);
  const [suspendedPageSize, setSuspendedPageSize] = useState<number>(() => {
    const saved = Number(localStorage.getItem("suspended_page_size"));
    return [25, 50, 100, 200].includes(saved) ? saved : 25;
  });
  const [suspendedPage, setSuspendedPage] = useState(1);

  useEffect(() => { localStorage.setItem("sales_page_size", String(pageSize)); }, [pageSize]);
  useEffect(() => { localStorage.setItem("suspended_page_size", String(suspendedPageSize)); }, [suspendedPageSize]);

  const sales = salesQuery.data ?? [];

  // Suspended sales for this business
  const suspendedQuery = useQuery({
    queryKey: ["suspended_sales_all", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("suspended_sales")
        .select("*, locations(name)")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!business,
  });

  const filteredSales = sales.filter((s) => {
    const matchesSearch =
      (s.invoice_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.customers?.name || "walk-in").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.payment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSales = useMemo(
    () => filteredSales.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredSales, currentPage, pageSize],
  );
  useEffect(() => { setPage(1); }, [search, statusFilter, pageSize]);

  const totalSales = sales.reduce((s, v) => s + Number(v.total), 0);
  const paidSales = sales.filter((s) => s.payment_status === "paid").length;
  const suspended = suspendedQuery.data || [];
  const suspendedTotalPages = Math.max(1, Math.ceil(suspended.length / suspendedPageSize));
  const suspendedCurrentPage = Math.min(suspendedPage, suspendedTotalPages);
  const paginatedSuspended = suspended.slice((suspendedCurrentPage - 1) * suspendedPageSize, suspendedCurrentPage * suspendedPageSize);
  useEffect(() => { setSuspendedPage(1); }, [suspendedPageSize]);

  const cancelSuspended = async (id: string) => {
    if (!confirm("Discard this suspended sale?")) return;
    const { error } = await supabase.from("suspended_sales").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["suspended_sales_all"] });
    qc.invalidateQueries({ queryKey: ["suspended_sales"] });
    toast.success("Suspended sale discarded");
  };

  const resumeSuspended = (s: any) => {
    // Send user to the POS, suspended carts can be resumed from the Held bar on POS
    navigate("/pos");
    toast.info(`Resume "${s.label}" from the Held bar on POS`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{isCashier ? "My Transactions" : "Sales"}</h1>

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales"><Eye className="h-4 w-4 mr-1" /> Sales</TabsTrigger>
          <TabsTrigger value="suspended">
            <Pause className="h-4 w-4 mr-1" /> Suspended
            {suspended.length > 0 && <Badge variant="secondary" className="ml-2">{suspended.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Sales</p>
            <p className="text-2xl font-bold">KES {totalSales.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Transactions</p>
            <p className="text-2xl font-bold">{sales.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold text-primary">{paidSales} / {sales.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoice or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesQuery.isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filteredSales.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No sales found. Create sales from the POS screen.</TableCell></TableRow>
              ) : (
                paginatedSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.invoice_number || "—"}</TableCell>
                    <TableCell>{format(new Date(sale.created_at), "PP")}</TableCell>
                    <TableCell>{sale.customers?.name || "Walk-in"}</TableCell>
                    <TableCell>{sale.locations?.name}</TableCell>
                    <TableCell className="text-right font-medium">KES {Number(sale.total).toLocaleString()}</TableCell>
                    <TableCell>
                      {sale.status === "cancelled" ? (
                        <Badge variant="outline" className="border-destructive text-destructive">Cancelled</Badge>
                      ) : (
                        <Badge variant={sale.payment_status === "paid" ? "default" : sale.payment_status === "partial" ? "secondary" : "destructive"}>
                          {sale.payment_status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedSale(sale); setDetailOpen(true); }} aria-label="View sale">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canCancel && sale.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancel sale"
                          title="Cancel sale (reverse stock movements)"
                          onClick={() => {
                            if (!confirm(`Cancel sale ${sale.invoice_number || ""}? Inventory will be restored and stock movement records removed.`)) return;
                            cancelSale.mutate({ id: sale.id, cancel: true });
                          }}
                        >
                          <Ban className="h-4 w-4 text-warning" />
                        </Button>
                      )}
                      {canCancel && sale.status === "cancelled" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Reactivate sale"
                          title="Reactivate sale"
                          onClick={() => cancelSale.mutate({ id: sale.id, cancel: false })}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete sale"
                          onClick={() => {
                            if (!canDelete) return;
                            if (!confirm("Delete this sale? Inventory will be restored.")) return;
                            deleteSale.mutate(sale.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1">
        <div className="text-sm text-muted-foreground">
          Showing {filteredSales.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSales.length)} of {filteredSales.length}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
          <span className="text-sm">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="suspended">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Suspended On</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suspendedQuery.isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : suspended.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No suspended sales.</TableCell></TableRow>
                  ) : (
                    paginatedSuspended.map((s: any) => {
                      const cart = (s.cart || []) as any[];
                      const itemCount = cart.reduce((a, l) => a + Number(l.quantity || 0), 0);
                      const total = cart.reduce((a, l) => a + Number(l.unit_price || 0) * Number(l.quantity || 0) - Number(l.discount || 0), 0);
                      return (
                        <TableRow key={s.id}>
                          <TableCell>{format(new Date(s.created_at), "PPp")}</TableCell>
                          <TableCell className="font-medium">{s.label}</TableCell>
                          <TableCell>{s.customer_name || "Walk-in"}</TableCell>
                          <TableCell>{s.locations?.name || "—"}</TableCell>
                          <TableCell className="text-right">{itemCount}</TableCell>
                          <TableCell className="text-right">KES {total.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" title="Resume on POS" onClick={() => resumeSuspended(s)}>
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Discard" onClick={() => cancelSuspended(s.id)}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1 mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {suspended.length === 0 ? 0 : (suspendedCurrentPage - 1) * suspendedPageSize + 1}–{Math.min(suspendedCurrentPage * suspendedPageSize, suspended.length)} of {suspended.length}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page</span>
              <Select value={String(suspendedPageSize)} onValueChange={(v) => setSuspendedPageSize(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={suspendedCurrentPage <= 1} onClick={() => setSuspendedPage(suspendedCurrentPage - 1)}>Previous</Button>
              <span className="text-sm">Page {suspendedCurrentPage} of {suspendedTotalPages}</span>
              <Button variant="outline" size="sm" disabled={suspendedCurrentPage >= suspendedTotalPages} onClick={() => setSuspendedPage(suspendedCurrentPage + 1)}>Next</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <SaleDetailDialog open={detailOpen} onOpenChange={setDetailOpen} sale={selectedSale} />
    </div>
  );
};

export default Sales;
