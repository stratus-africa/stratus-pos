import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Receipt, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface SaleActivity {
  id: string;
  invoice_number: string | null;
  total: number;
  payment_status: string;
  created_at: string;
  business_name?: string;
}

interface ExpenseActivity {
  id: string;
  amount: number;
  description: string | null;
  date: string;
  payment_method: string | null;
  business_id: string;
  business_name?: string;
}

interface SignupActivity {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  business_name?: string;
  business_id: string | null;
}

export default function SuperAdminActivity() {
  const [sales, setSales] = useState<SaleActivity[]>([]);
  const [expenses, setExpenses] = useState<ExpenseActivity[]>([]);
  const [signups, setSignups] = useState<SignupActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      const [salesRes, expensesRes, profilesRes, bizRes] = await Promise.all([
        supabase.from("sales").select("id, invoice_number, total, payment_status, created_at, business_id").order("created_at", { ascending: false }).limit(50),
        supabase.from("expenses").select("id, amount, description, date, payment_method, business_id").order("date", { ascending: false }).limit(50),
        supabase.from("profiles").select("id, full_name, email, created_at, business_id").order("created_at", { ascending: false }).limit(50),
        supabase.from("businesses").select("id, name"),
      ]);

      const bizMap = new Map((bizRes.data || []).map((b) => [b.id, b.name]));

      setSales(
        (salesRes.data || []).map((s: any) => ({
          ...s,
          business_name: bizMap.get(s.business_id) || "Unknown",
        }))
      );

      setExpenses(
        (expensesRes.data || []).map((e: any) => ({
          ...e,
          business_name: bizMap.get(e.business_id) || "Unknown",
        }))
      );

      setSignups(
        (profilesRes.data || []).map((p: any) => ({
          ...p,
          business_name: p.business_id ? bizMap.get(p.business_id) || "Unknown" : undefined,
        }))
      );

      setLoading(false);
    };
    fetchActivity();
  }, []);

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

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales" className="gap-1">
            <ShoppingCart className="h-4 w-4" /> Sales
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1">
            <DollarSign className="h-4 w-4" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="signups" className="gap-1">
            <Receipt className="h-4 w-4" /> Signups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Sales (last 50)</CardTitle>
            </CardHeader>
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
                  {sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.invoice_number || "—"}</TableCell>
                      <TableCell className="font-medium">{s.business_name}</TableCell>
                      <TableCell>
                        <Badge variant={s.payment_status === "paid" ? "default" : "secondary"} className="capitalize">
                          {s.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">KES {Number(s.total).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(s.created_at), "MMM dd, HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {sales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No sales yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Expenses (last 50)</CardTitle>
            </CardHeader>
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
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.description || "—"}</TableCell>
                      <TableCell className="font-medium">{e.business_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {e.payment_method?.replace("_", " ") || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-500">KES {Number(e.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(e.date), "MMM dd, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                  {expenses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No expenses yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signups">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Signups (last 50)</CardTitle>
            </CardHeader>
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
                  {signups.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.full_name || "Unnamed"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.email || "—"}</TableCell>
                      <TableCell>{s.business_name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(s.created_at), "MMM dd, yyyy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                  {signups.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No signups yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
