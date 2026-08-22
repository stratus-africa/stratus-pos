import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, Download, FileText, Plus, Receipt, Search, X } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
};

type Expense = {
  id: string;
  business_id: string;
  location_id: string | null;
  category_id: string | null;
  description: string;
  amount: number;
  date: string;
  status: string;
  payment_method: string | null;
  payment_reference: string | null;
  receipt_url: string | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  expense_categories?: { name: string } | null;
  locations?: { name: string } | null;
};

type Category = { id: string; name: string; is_active: boolean };

const money = (value: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(value);

const statusVariant = (status: string) => {
  if (status === "rejected") return "destructive" as const;
  if (status === "approved" || status === "paid") return "default" as const;
  return "secondary" as const;
};

export default function Expenses() {
  const { business, currentLocation } = useBusiness();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();

  const canView = hasPermission("expenses.view");
  const canCreate = hasPermission("expenses.create");
  const canEdit = hasPermission("expenses.edit");
  const canDelete = hasPermission("expenses.delete");
  const canApprove = hasPermission("expenses.approve");
  const canReject = hasPermission("expenses.reject");
  const canPay = hasPermission("expenses.record_payment");
  const canViewCategories = hasPermission("expenses.view_categories");
  const canManageCategories = hasPermission("expenses.manage_categories");
  const canUploadReceipt = hasPermission("expenses.upload_receipt");
  const canExport = hasPermission("expenses.export");

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    category_id: "",
    notes: "",
    payment_method: "cash",
    payment_reference: "",
    receipt_url: "",
  });

  const expensesQuery = useQuery({
    queryKey: ["expenses", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business?.id) return [] as Expense[];
      let q = (supabase as any)
        .from("expenses")
        .select("*, expense_categories(name), locations(name)")
        .eq("business_id", business.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (currentLocation?.id) q = q.eq("location_id", currentLocation.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    enabled: !!business?.id && canView,
  });

  const categoriesQuery = useQuery({
    queryKey: ["expense-categories", business?.id],
    queryFn: async () => {
      if (!business?.id) return [] as Category[];
      const { data, error } = await (supabase as any)
        .from("expense_categories")
        .select("id,name,is_active")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    enabled: !!business?.id && canViewCategories,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expensesQuery.data ?? []).filter((e) => {
      const matchesTab = tab === "all" || e.status === tab;
      const matchesSearch =
        !q ||
        e.description.toLowerCase().includes(q) ||
        (e.expense_categories?.name ?? "").toLowerCase().includes(q) ||
        (e.locations?.name ?? "").toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [expensesQuery.data, search, tab]);

  const totals = useMemo(() => {
    const rows = expensesQuery.data ?? [];
    return {
      all: rows.reduce((s, e) => s + Number(e.amount || 0), 0),
      pending: rows.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.amount || 0), 0),
      approved: rows
        .filter((e) => ["approved", "paid"].includes(e.status))
        .reduce((s, e) => s + Number(e.amount || 0), 0),
    };
  }, [expensesQuery.data]);

  const resetForm = () =>
    setForm({
      description: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      category_id: "",
      notes: "",
      payment_method: "cash",
      payment_reference: "",
      receipt_url: "",
    });

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };
  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setForm({
      description: expense.description,
      amount: String(expense.amount),
      date: expense.date,
      category_id: expense.category_id ?? "",
      notes: expense.notes ?? "",
      payment_method: expense.payment_method ?? "cash",
      payment_reference: expense.payment_reference ?? "",
      receipt_url: expense.receipt_url ?? "",
    });
    setDialogOpen(true);
  };

  const saveExpense = async (submit: boolean) => {
    if (!business?.id || !canCreate || !form.description.trim() || Number(form.amount) <= 0) {
      toast.error("Enter a description and a positive amount");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        _location_id: currentLocation?.id ?? null,
        _category_id: form.category_id || null,
        _description: form.description.trim(),
        _amount: Number(form.amount),
        _date: form.date,
        _notes: form.notes || null,
        _payment_method: form.payment_method || null,
        _payment_reference: form.payment_reference || null,
        _receipt_url: form.receipt_url || null,
        _submit: submit,
      };
      if (editing) {
        const { error } = await (supabase as any).rpc("update_expense", { _expense_id: editing.id, ...payload });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc("create_expense", payload);
        if (error) throw error;
      }
      toast.success(submit ? "Expense submitted for approval" : "Expense saved as draft");
      setDialogOpen(false);
      resetForm();
      await qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not save expense");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (id: string, action: "approve" | "reject" | "pay" | "delete") => {
    setBusy(true);
    try {
      const rpc =
        action === "approve"
          ? "approve_expense"
          : action === "reject"
            ? "reject_expense"
            : action === "pay"
              ? "pay_expense"
              : "delete_expense";
      const args: Record<string, unknown> = { _expense_id: id };
      if (action === "reject") args._reason = window.prompt("Rejection reason") || "Rejected by approver";
      if (action === "pay") {
        args._payment_method = window.prompt("Payment method", "cash") || "cash";
        args._payment_reference = window.prompt("Payment reference", "") || null;
      }
      const { error } = await (supabase as any).rpc(rpc, args);
      if (error) throw error;
      toast.success(
        action === "approve"
          ? "Expense approved"
          : action === "reject"
            ? "Expense rejected"
            : action === "pay"
              ? "Expense marked paid"
              : "Expense deleted",
      );
      await qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e: any) {
      toast.error(e?.message || "Expense action failed");
    } finally {
      setBusy(false);
    }
  };

  const addCategory = async () => {
    if (!business?.id || !categoryName.trim()) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("create_expense_category", { _name: categoryName.trim() });
      if (error) throw error;
      setCategoryName("");
      setCategoryDialog(false);
      await qc.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("Expense category created");
    } catch (e: any) {
      toast.error(e?.message || "Could not create category");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!canExport) return;
    const rows = filtered.map((e) => [
      e.date,
      e.description,
      e.expense_categories?.name ?? "",
      e.locations?.name ?? "",
      e.amount,
      e.status,
      e.payment_method ?? "",
      e.payment_reference ?? "",
    ]);
    const csv = [
      ["Date", "Description", "Category", "Location", "Amount", "Status", "Payment Method", "Reference"],
      ...rows,
    ]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expenses.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canView)
    return (
      <Alert>
        <AlertDescription>You do not have permission to view expenses.</AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Record, approve and pay business expenses.</p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          )}
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Expense
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(totals.all)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(totals.pending)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Approved / Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(totals.approved)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="pending">Pending Approval</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          {canViewCategories && <TabsTrigger value="categories">Categories</TabsTrigger>}
        </TabsList>
        {tab !== "categories" ? (
          <TabsContent value={tab} className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search expenses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="p-3 text-left">Date</th>
                        <th className="p-3 text-left">Description</th>
                        <th className="p-3 text-left">Category</th>
                        <th className="p-3 text-left">Location</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted-foreground">
                            No expenses found.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((e) => (
                          <tr key={e.id} className="border-b last:border-0">
                            <td className="p-3 whitespace-nowrap">{e.date}</td>
                            <td className="p-3">
                              <div className="font-medium">{e.description}</div>
                              {e.notes && <div className="text-xs text-muted-foreground">{e.notes}</div>}
                              {e.receipt_url && (
                                <a
                                  className="text-xs text-primary hover:underline"
                                  href={e.receipt_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FileText className="mr-1 inline h-3 w-3" />
                                  Receipt
                                </a>
                              )}
                            </td>
                            <td className="p-3">{e.expense_categories?.name || "—"}</td>
                            <td className="p-3">{e.locations?.name || "—"}</td>
                            <td className="p-3 text-right font-medium">{money(Number(e.amount))}</td>
                            <td className="p-3">
                              <Badge variant={statusVariant(e.status)}>{STATUS_LABELS[e.status] || e.status}</Badge>
                              {e.rejection_reason && (
                                <div className="mt-1 text-xs text-destructive">{e.rejection_reason}</div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end gap-1">
                                {canEdit && ["draft", "rejected"].includes(e.status) && (
                                  <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                                    Edit
                                  </Button>
                                )}
                                {canApprove && e.status === "pending" && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={busy}
                                    title="Approve"
                                    onClick={() => transition(e.id, "approve")}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                )}
                                {canReject && e.status === "pending" && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={busy}
                                    title="Reject"
                                    onClick={() => transition(e.id, "reject")}
                                  >
                                    <X className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                                {canPay && e.status === "approved" && (
                                  <Button size="sm" disabled={busy} onClick={() => transition(e.id, "pay")}>
                                    Pay
                                  </Button>
                                )}
                                {canDelete && e.status === "draft" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    disabled={busy}
                                    onClick={() => transition(e.id, "delete")}
                                  >
                                    Delete
                                  </Button>
                                )}
                                {canUploadReceipt && ["draft", "rejected"].includes(e.status) && (
                                  <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                                    <Receipt className="mr-1 h-3.5 w-3.5" />
                                    Receipt
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : (
          <TabsContent value="categories">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Expense Categories</CardTitle>
                {canManageCategories && (
                  <Button onClick={() => setCategoryDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Category
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {(categoriesQuery.data ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between border-b py-3 last:border-0">
                    <span>{c.name}</span>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                ))}
                {(categoriesQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No expense categories yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Expense" : "New Expense"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={form.category_id || "none"}
                onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Payment Method</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Payment Reference</Label>
                <Input
                  value={form.payment_reference}
                  onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Receipt URL {canUploadReceipt ? "(optional)" : ""}</Label>
              <Input
                value={form.receipt_url}
                onChange={(e) => setForm({ ...form, receipt_url: e.target.value })}
                placeholder="https://..."
                disabled={!canUploadReceipt}
              />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => saveExpense(false)}>
              Save Draft
            </Button>
            <Button disabled={busy} onClick={() => saveExpense(true)}>
              Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Expense Category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="e.g. Utilities"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialog(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !categoryName.trim()} onClick={addCategory}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
