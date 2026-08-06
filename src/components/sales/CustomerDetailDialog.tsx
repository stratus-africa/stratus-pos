import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Customer, Sale } from "@/hooks/useSales";
import SaleDetailDialog from "@/components/sales/SaleDetailDialog";
import { format } from "date-fns";

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

  useEffect(() => {
    if (!open || !customer) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("sales")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(200);
      setSales((data ?? []) as unknown as Sale[]);
      setLoading(false);
    })();
  }, [open, customer?.id]);

  if (!customer) return null;

  const totalSales = sales.reduce((s, x) => s + Number((x as any).total || 0), 0);
  const outstanding = sales.reduce(
    (s, x) => s + Math.max(0, Number((x as any).total || 0) - Number((x as any).amount_paid || 0)),
    0,
  );

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
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell>
                      </TableRow>
                    ) : sales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          No transactions for this customer yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sales.map((s: any, i) => (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer ${i % 2 ? "bg-muted/30" : ""}`}
                          onClick={() => setSelected(s as Sale)}
                        >
                          <TableCell>{s.created_at ? format(new Date(s.created_at), "dd MMM yyyy HH:mm") : "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{s.sale_number || s.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-right">{money(s.total)}</TableCell>
                          <TableCell className="text-right">{money(s.amount_paid)}</TableCell>
                          <TableCell>
                            <Badge variant={s.payment_status === "paid" ? "default" : s.payment_status === "partial" ? "secondary" : "destructive"}>
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
