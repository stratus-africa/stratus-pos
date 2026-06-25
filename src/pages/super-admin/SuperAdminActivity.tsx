import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Receipt, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

type ActivityType = "sales" | "expenses" | "signups";

interface Row {
  id: string;
  created_at: string;
  business_id: string | null;
  business_name?: string;
  // sales
  invoice_number?: string | null;
  total?: number;
  payment_status?: string;
  // expenses
  amount?: number;
  description?: string | null;
  payment_method?: string | null;
  // signups
  full_name?: string | null;
  email?: string | null;
}

const PAGE_SIZES = [25, 50, 100, 200];

export default function SuperAdminActivity() {
  const [activity, setActivity] = useState<ActivityType>("sales");
  const [sales, setSales] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [signups, setSignups] = useState<Row[]>([]);
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [tenant, setTenant] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = Number(localStorage.getItem("sa_activity_page_size"));
    return PAGE_SIZES.includes(v) ? v : 25;
  });

  useEffect(() => {
    localStorage.setItem("sa_activity_page_size", String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [activity, tenant, fromDate, toDate, pageSize]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [salesRes, expensesRes, profilesRes, bizRes] = await Promise.all([
        supabase.from("sales").select("id, invoice_number, total, payment_status, created_at, business_id").order("created_at", { ascending: false }).limit(1000),
        supabase.from("expenses").select("id, amount, description, date, payment_method, business_id").order("date", { ascending: false }).limit(1000),
        supabase.from("profiles").select("id, full_name, email, created_at, business_id").order("created_at", { ascending: false }).limit(1000),
        supabase.from("businesses").select("id, name").order("name"),
      ]);

      const bizList = (bizRes.data || []) as { id: string; name: string }[];
      const bizMap = new Map(bizList.map((b) => [b.id, b.name]));
      setBusinesses(bizList);

      setSales((salesRes.data || []).map((s: any) => ({ ...s, business_name: bizMap.get(s.business_id) || "Unknown" })));
      setExpenses((expensesRes.data || []).map((e: any) => ({ ...e, created_at: e.date, business_name: bizMap.get(e.business_id) || "Unknown" })));
      setSignups((profilesRes.data || []).map((p: any) => ({ ...p, business_name: p.business_id ? bizMap.get(p.business_id) || "Unknown" : undefined })));
      setLoading(false);
    };
    fetchAll();
  }, []);

  const source = activity === "sales" ? sales : activity === "expenses" ? expenses : signups;

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate).getTime() : null;
    const to = toDate ? new Date(toDate).getTime() + 86400000 : null;
    return source.filter((r) => {
      if (tenant !== "all" && r.business_id !== tenant) return false;
      const t = new Date(r.created_at).getTime();
      if (from && t < from) return false;
      if (to && t >= to) return false;
      return true;
    });
  }, [source, tenant, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Activity</h1>
        <p className="text-muted-foreground">Recent activity across all businesses</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div>
              <Label className="text-xs">Activity</Label>
              <Select value={activity} onValueChange={(v) => setActivity(v as ActivityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="expenses">Expenses</SelectItem>
                  <SelectItem value="signups">Signups</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tenant</Label>
              <Select value={tenant} onValueChange={setTenant}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="w-full" onClick={() => { setTenant("all"); setFromDate(""); setToDate(""); }}>
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activity} onValueChange={(v) => setActivity(v as ActivityType)}>
        <TabsList>
          <TabsTrigger value="sales" className="gap-1"><ShoppingCart className="h-4 w-4" /> Sales</TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1"><DollarSign className="h-4 w-4" /> Expenses</TabsTrigger>
          <TabsTrigger value="signups" className="gap-1"><Receipt className="h-4 w-4" /> Signups</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Card>
            <CardHeader><CardTitle className="text-base">Sales ({filtered.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.invoice_number || "—"}</TableCell>
                      <TableCell className="font-medium">{s.business_name}</TableCell>
                      <TableCell>
                        <Badge variant={s.payment_status === "paid" ? "default" : "secondary"} className="capitalize">{s.payment_status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">KES {Number(s.total).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(s.created_at), "MMM dd, HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {pageRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No results</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardHeader><CardTitle className="text-base">Expenses ({filtered.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.description || "—"}</TableCell>
                      <TableCell className="font-medium">{e.business_name}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{e.payment_method?.replace("_", " ") || "—"}</Badge></TableCell>
                      <TableCell className="text-right font-medium text-red-500">KES {Number(e.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(e.created_at), "MMM dd, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                  {pageRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No results</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signups">
          <Card>
            <CardHeader><CardTitle className="text-base">Signups ({filtered.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.full_name || "Unnamed"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.email || "—"}</TableCell>
                      <TableCell>{s.business_name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(s.created_at), "MMM dd, yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {pageRows.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No results</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
