import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Plus, Search, Layers, Trash2 } from "lucide-react";
import { useExpenses, useExpenseCategories } from "@/hooks/useExpenses";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { QuickAddDialog } from "@/components/products/QuickAddDialog";

const Expenses = () => {
  const { query: expensesQuery, create: createExpense, remove: removeExpense } = useExpenses();
  const { query: categoriesQuery, create: createCategory, remove: removeCategory } = useExpenseCategories();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);

  const expenses = expensesQuery.data || [];
  const filtered = expenses.filter((e) => {
    const matchSearch = (e.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.expense_categories?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || e.category_id === categoryFilter;
    return matchSearch && matchCategory;
  });

  const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0);

  const formatKES = (n: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);

  const formatPayment = (m: string | null) => {
    if (!m) return "—";
    switch (m) {
      case "mpesa": return "M-Pesa";
      case "bank_transfer": return "Bank Transfer";
      default: return m.charAt(0).toUpperCase() + m.slice(1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <Button onClick={() => setExpenseDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Record Expense
        </Button>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="text-sm text-muted-foreground">Total Expenses (filtered)</div>
          <div className="text-2xl font-bold">{formatKES(totalExpenses)}</div>
        </CardContent>
      </Card>

      <Tabs defaultValue="expenses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="expenses"><CreditCard className="mr-1 h-4 w-4" /> Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="categories"><Layers className="mr-1 h-4 w-4" /> Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by description or category..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categoriesQuery.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No expenses recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-muted-foreground">
                          {new Date(e.date).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          {e.expense_categories?.name ? (
                            <Badge variant="outline">{e.expense_categories.name}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{e.description || "—"}</TableCell>
                        <TableCell>{e.locations?.name || "—"}</TableCell>
                        <TableCell>{formatPayment(e.payment_method)}</TableCell>
                        <TableCell className="text-right font-medium">{formatKES(e.amount)}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeExpense.mutate(e.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Expense Categories</CardTitle>
              <Button size="sm" onClick={() => setCatDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add</Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {categoriesQuery.data?.map((c) => (
                  <Badge key={c.id} variant="outline" className="gap-1 py-1.5 px-3 text-sm">
                    {c.name}
                    <button onClick={() => removeCategory.mutate(c.id)} className="ml-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(!categoriesQuery.data || categoriesQuery.data.length === 0) && (
                  <p className="text-muted-foreground text-sm">No expense categories yet. Add some like "Rent", "Utilities", "Transport".</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        onSubmit={(data) => createExpense.mutate(data)}
        isLoading={createExpense.isPending}
      />

      <QuickAddDialog
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        title="Add Expense Category"
        label="Category Name"
        onSubmit={(name) => createCategory.mutate(name)}
        isLoading={createCategory.isPending}
      />
    </div>
  );
};

export default Expenses;
