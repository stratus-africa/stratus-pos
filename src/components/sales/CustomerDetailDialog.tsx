import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Customer, Sale } from "@/hooks/useSales";
import SaleDetailDialog from "@/components/sales/SaleDetailDialog";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

const money = (n: number) => `KES ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function CustomerDetailDialog({ open, onOpenChange, customer }: Props) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    if (!open || !customer) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, payments(method)")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(200);
      setSales((data ?? []) as unknown as Sale[]);
      setLoading(false);
    })();
  }, [open, customer?.id]);

  const totalSales = sales.reduce((s, x) => s + Number((x as any).total || 0), 0);
  const outstanding = sales.reduce(
    (s, x) => s + Math.max(0, Number((x as any).total || 0) - Number((x as any).amount_paid || 0)),
    0,
  );
  const methods = useMemo(
    () =>
      Array.from(
        new Set(
          sales.flatMap((sale: any) => (sale.payments || []).map((payment: any) => payment.method).filter(Boolean)),
        ),
      ),
    [sales],
  );
  const filteredSales = useMemo(
    () =>
      sales.filter((sale: any) => {
        const created = sale.created_at ? new Date(sale.created_at) : null;
        const matchesSearch =
          !search.trim() ||
          `${sale.sale_number || ""} ${sale.invoice_number || ""} ${sale.id}`
            .toLowerCase()
            .includes(search.trim().toLowerCase());
        const saleMethods = (sale.payments || []).map((payment: any) => payment.method);
        const matchesMethod = paymentMethod === "all" || saleMethods.includes(paymentMethod);
        const matchesStatus =
          paymentStatus === "all" || sale.payment_status === paymentStatus || sale.status === paymentStatus;
        const matchesFrom = !fromDate || (created && created >= new Date(`${fromDate}T00:00:00`));
        const matchesTo = !toDate || (created && created <= new Date(`${toDate}T23:59:59.999`));
        return matchesSearch && matchesMethod && matchesStatus && matchesFrom && matchesTo;
      }),
    [sales, search, paymentMethod, paymentStatus, fromDate, toDate],
  );

  if (!customer) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{customer.name}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="details">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="details">Customer details</TabsTrigger>
              <TabsTrigger value="transactions">Transactions ({sales.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3 pt-4">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <Field label="Name" value={customer.name} />
                <Field label="Phone" value={customer.phone || "—"} />
                <Field label="Email" value={customer.email || "—"} />
                <Field label="Address" value={(customer as any).address || "—"} />
                <Field label="Account balance" value={money(Number(customer.balance || 0))} />
                <Field label="Loyalty points" value={String((customer as any).loyalty_points ?? 0)} />
                <Field label="Lifetime sales" value={money(totalSales)} />
                <Field label="Outstanding on invoices" value={money(outstanding)} />
              </div>
            </TabsContent>

            <TabsContent value="transactions" className="pt-4">
              <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="relative sm:col-span-2">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    placeholder="Search invoice or sale…"
                  />
                </div>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All methods</SelectItem>
                    {methods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    aria-label="From date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                  <Input type="date" aria-label="To date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : filteredSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No transactions for this customer yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSales.map((s: any, i) => (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer ${i % 2 ? "bg-muted/30" : ""}`}
                          onClick={() => setSelected(s as Sale)}
                        >
                          <TableCell>
                            {s.created_at ? format(new Date(s.created_at), "dd MMM yyyy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{s.sale_number || s.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-right">{money(s.total)}</TableCell>
                          <TableCell className="text-right">{money(s.amount_paid)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                s.payment_status === "paid"
                                  ? "default"
                                  : s.payment_status === "partial"
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {s.payment_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <SaleDetailDialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)} sale={selected} />
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
