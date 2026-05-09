import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Search, Ban, CheckCircle2, Pencil, Eye, Loader2, Plus, Trash2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AddBusinessDialog } from "@/components/super-admin/AddBusinessDialog";

const LAST_TENANT_KEY = "super_admin_last_tenant_id";

interface SubInfo {
  status: string;
  current_period_end: string | null;
  plan_code: string | null;
}

interface BusinessRow {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  created_at: string;
  is_active: boolean;
  tax_rate: number | null;
  business_type?: string | null;
  owner_id: string | null;
  _userCount: number;
  _locationCount: number;
  _salesCount: number;
  _revenue: number;
  _subscription: SubInfo | null;
}

const SUB_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string; label: string }> = {
  active:   { variant: "default",   className: "bg-emerald-500/10 text-emerald-600 border-emerald-200", label: "Active" },
  trialing: { variant: "default",   className: "bg-blue-500/10 text-blue-600 border-blue-200",         label: "Trial" },
  past_due: { variant: "secondary", className: "bg-amber-500/10 text-amber-700 border-amber-200",      label: "Past Due" },
  canceled: { variant: "secondary", className: "bg-muted text-muted-foreground",                       label: "Canceled" },
  none:     { variant: "outline",   className: "text-muted-foreground",                                label: "No Sub" },
};

export default function SuperAdminBusinesses() {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const [editBiz, setEditBiz] = useState<BusinessRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("KES");
  const [editTaxRate, setEditTaxRate] = useState("16");
  const [editTimezone, setEditTimezone] = useState("Africa/Nairobi");
  const [saving, setSaving] = useState(false);

  const [masquerading, setMasquerading] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [lastViewedId, setLastViewedId] = useState<string | null>(
    () => sessionStorage.getItem(LAST_TENANT_KEY)
  );

  // Refresh highlight whenever we land back on the list
  useEffect(() => {
    setLastViewedId(sessionStorage.getItem(LAST_TENANT_KEY));
  }, [location.key]);

  const openTenant = (id: string) => {
    sessionStorage.setItem(LAST_TENANT_KEY, id);
    setLastViewedId(id);
    navigate(`/super-admin/businesses/${id}`);
  };

  const [deleteBiz, setDeleteBiz] = useState<BusinessRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    const [bizRes, salesRes, subsRes] = await Promise.all([
      supabase.from("businesses").select("*"),
      supabase.from("sales").select("business_id, total"),
      supabase.from("subscriptions").select("user_id, status, current_period_end, plan_code"),
    ]);
    if (!bizRes.data) { setLoading(false); return; }

    const salesByBiz = new Map<string, { count: number; revenue: number }>();
    (salesRes.data || []).forEach((s) => {
      const entry = salesByBiz.get(s.business_id) || { count: 0, revenue: 0 };
      entry.count++;
      entry.revenue += Number(s.total);
      salesByBiz.set(s.business_id, entry);
    });

    const subsByUser = new Map<string, SubInfo>();
    (subsRes.data || []).forEach((s: any) => {
      // Keep the most recent / active one if multiple
      const existing = subsByUser.get(s.user_id);
      if (!existing || s.status === "active" || s.status === "trialing") {
        subsByUser.set(s.user_id, {
          status: s.status,
          current_period_end: s.current_period_end,
          plan_code: s.plan_code,
        });
      }
    });

    const enriched = await Promise.all(
      bizRes.data.map(async (biz: any) => {
        const [usersRes, locsRes] = await Promise.all([
          supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("business_id", biz.id),
          supabase.from("locations").select("id", { count: "exact", head: true }).eq("business_id", biz.id),
        ]);
        const salesData = salesByBiz.get(biz.id) || { count: 0, revenue: 0 };

        // Find subscription via owner_id, falling back to first admin for the business
        let sub: SubInfo | null = biz.owner_id ? (subsByUser.get(biz.owner_id) || null) : null;
        if (!sub) {
          const { data: adminRow } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("business_id", biz.id)
            .eq("role", "admin")
            .limit(1)
            .maybeSingle();
          if (adminRow?.user_id) sub = subsByUser.get(adminRow.user_id) || null;
        }

        return {
          ...biz,
          is_active: biz.is_active ?? true,
          _userCount: usersRes.count || 0,
          _locationCount: locsRes.count || 0,
          _salesCount: salesData.count,
          _revenue: salesData.revenue,
          _subscription: sub,
        } as BusinessRow;
      })
    );

    setBusinesses(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const toggleActive = async (bizId: string, currentlyActive: boolean) => {
    setToggling(bizId);
    const { error } = await supabase
      .from("businesses")
      .update({ is_active: !currentlyActive })
      .eq("id", bizId);
    if (error) {
      toast.error("Failed to update business status");
    } else {
      toast.success(currentlyActive ? "Business deactivated" : "Business reactivated");
      setBusinesses((prev) =>
        prev.map((b) => (b.id === bizId ? { ...b, is_active: !currentlyActive } : b))
      );
    }
    setToggling(null);
  };

  const isSubscriptionActive = (sub: SubInfo | null): boolean => {
    if (!sub) return false;
    if (sub.status !== "active" && sub.status !== "trialing") return false;
    if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) return false;
    return true;
  };

  const handleDelete = async () => {
    if (!deleteBiz) return;
    if (isSubscriptionActive(deleteBiz._subscription)) {
      toast.error("Cannot delete a business with an active subscription. Cancel it first.");
      return;
    }
    setDeleting(true);
    try {
      // Delete in dependency order so FKs / RLS don't block
      const bizId = deleteBiz.id;

      // Sales chain
      const { data: saleRows } = await supabase.from("sales").select("id").eq("business_id", bizId);
      const saleIds = (saleRows || []).map((s) => s.id);
      if (saleIds.length) {
        await supabase.from("payments").delete().in("sale_id", saleIds);
        await supabase.from("sale_items").delete().in("sale_id", saleIds);
      }
      await supabase.from("sales").delete().eq("business_id", bizId);

      // Purchase chain
      const { data: purchRows } = await supabase.from("purchases").select("id").eq("business_id", bizId);
      const purchIds = (purchRows || []).map((p) => p.id);
      if (purchIds.length) await supabase.from("purchase_items").delete().in("purchase_id", purchIds);
      await supabase.from("purchases").delete().eq("business_id", bizId);

      // Journal chain
      const { data: jeRows } = await supabase.from("journal_entries").select("id").eq("business_id", bizId);
      const jeIds = (jeRows || []).map((j) => j.id);
      if (jeIds.length) await supabase.from("journal_entry_lines").delete().in("journal_entry_id", jeIds);
      await supabase.from("journal_entries").delete().eq("business_id", bizId);

      // Other business-scoped tables
      await Promise.all([
        supabase.from("bank_transactions").delete().eq("business_id", bizId),
        supabase.from("expenses").delete().eq("business_id", bizId),
        supabase.from("stock_adjustments" as any).delete().in("location_id",
          (await supabase.from("locations").select("id").eq("business_id", bizId)).data?.map((l) => l.id) || ["00000000-0000-0000-0000-000000000000"]
        ),
        supabase.from("product_batches" as any).delete().eq("business_id", bizId),
        supabase.from("payment_method_accounts").delete().eq("business_id", bizId),
        supabase.from("bank_accounts").delete().eq("business_id", bizId),
        supabase.from("mpesa_transactions").delete().eq("business_id", bizId),
        supabase.from("pos_sessions").delete().eq("business_id", bizId),
        supabase.from("tax_rates").delete().eq("business_id", bizId),
        supabase.from("expense_categories").delete().eq("business_id", bizId),
        supabase.from("chart_of_accounts").delete().eq("business_id", bizId),
      ]);

      // Inventory via locations
      const { data: locs } = await supabase.from("locations").select("id").eq("business_id", bizId);
      const locIds = (locs || []).map((l) => l.id);
      if (locIds.length) await supabase.from("inventory").delete().in("location_id", locIds);

      // Catalog
      await supabase.from("products").delete().eq("business_id", bizId);
      await supabase.from("brands").delete().eq("business_id", bizId);
      await supabase.from("categories").delete().eq("business_id", bizId);
      await supabase.from("units").delete().eq("business_id", bizId);
      await supabase.from("customers").delete().eq("business_id", bizId);
      await supabase.from("suppliers").delete().eq("business_id", bizId);

      // Locations + roles + profile detach
      await supabase.from("locations").delete().eq("business_id", bizId);
      await supabase.from("user_roles").delete().eq("business_id", bizId);
      await supabase.from("profiles").update({ business_id: null }).eq("business_id", bizId);

      // Finally the business
      const { error: bizErr } = await supabase.from("businesses").delete().eq("id", bizId);
      if (bizErr) throw bizErr;

      toast.success(`Deleted "${deleteBiz.name}"`);
      setBusinesses((prev) => prev.filter((b) => b.id !== bizId));
      setDeleteBiz(null);
    } catch (err: any) {
      toast.error("Failed to delete: " + (err.message || "unknown error"));
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (biz: BusinessRow) => {
    setEditBiz(biz);
    setEditName(biz.name);
    setEditCurrency(biz.currency);
    setEditTaxRate(String(biz.tax_rate ?? 16));
    setEditTimezone(biz.timezone);
  };

  const handleSaveEdit = async () => {
    if (!editBiz) return;
    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        name: editName.trim(),
        currency: editCurrency,
        tax_rate: parseFloat(editTaxRate) || 0,
        timezone: editTimezone,
      })
      .eq("id", editBiz.id);

    if (error) {
      toast.error("Failed to update: " + error.message);
    } else {
      toast.success("Business updated");
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === editBiz.id
            ? { ...b, name: editName.trim(), currency: editCurrency, tax_rate: parseFloat(editTaxRate), timezone: editTimezone }
            : b
        )
      );
      setEditBiz(null);
    }
    setSaving(false);
  };

  const handleMasquerade = (bizId: string) => {
    setMasquerading(bizId);
    localStorage.setItem("masquerade_business_id", bizId);
    window.location.href = "/";
  };

  const filtered = businesses.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">All Businesses</h1>
          <p className="text-muted-foreground">{businesses.length} registered businesses</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search businesses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Business
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead className="text-center">Locations</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((biz) => {
                const sub = biz._subscription;
                const subKey = sub?.status && SUB_BADGES[sub.status] ? sub.status : (sub ? "canceled" : "none");
                const subBadge = SUB_BADGES[subKey];
                const subActive = isSubscriptionActive(sub);
                return (
                  <TableRow
                    key={biz.id}
                    className={cn(
                      !biz.is_active && "opacity-60",
                      lastViewedId === biz.id && "bg-emerald-50/60 hover:bg-emerald-50"
                    )}
                  >
                    <TableCell className="font-medium">
                      <button
                        className="text-left hover:underline text-primary cursor-pointer"
                        onClick={() => openTenant(biz.id)}
                      >
                        {biz.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {biz.is_active ? (
                          <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 w-fit">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-destructive/10 text-destructive border-destructive/20 w-fit">Inactive</Badge>
                        )}
                        <Badge variant={subBadge.variant} className={`${subBadge.className} w-fit`}>
                          <CreditCard className="h-3 w-3 mr-1" />
                          {subBadge.label}
                        </Badge>
                        {sub?.current_period_end && (
                          <span className="text-[10px] text-muted-foreground">
                            until {format(new Date(sub.current_period_end), "MMM dd, yyyy")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">
                      {(biz.business_type || "general").replace("_", " ")}
                    </TableCell>
                    <TableCell className="text-center">{biz._userCount}</TableCell>
                    <TableCell className="text-center">{biz._locationCount}</TableCell>
                    <TableCell className="text-right font-medium">
                      {biz.currency} {biz._revenue.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(biz.created_at), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/super-admin/businesses/${biz.id}/edit`)} title="Edit business">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMasquerade(biz.id)}
                          disabled={masquerading === biz.id}
                          title="View as this business"
                        >
                          {masquerading === biz.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant={biz.is_active ? "destructive" : "outline"}
                          size="sm"
                          disabled={toggling === biz.id}
                          onClick={() => toggleActive(biz.id, biz.is_active)}
                        >
                          {biz.is_active ? (
                            <><Ban className="h-3 w-3 mr-1" /> Deactivate</>
                          ) : (
                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Reactivate</>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteBiz(biz)}
                          disabled={subActive}
                          title={subActive ? "Cannot delete — has active subscription" : "Delete business"}
                          className={subActive ? "" : "text-destructive hover:bg-destructive/10"}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {search ? "No businesses match your search" : "No businesses registered yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Business Dialog */}
      <Dialog open={!!editBiz} onOpenChange={(open) => !open && setEditBiz(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Business — {editBiz?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={editCurrency} onValueChange={setEditCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KES">KES</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="UGX">UGX</SelectItem>
                    <SelectItem value="TZS">TZS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tax Rate (%)</Label>
                <Input type="number" min={0} max={100} step={0.5} value={editTaxRate} onChange={(e) => setEditTaxRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={editTimezone} onValueChange={setEditTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT)</SelectItem>
                  <SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem>
                  <SelectItem value="Africa/Cairo">Africa/Cairo (EET)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBiz(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteBiz} onOpenChange={(o) => !o && setDeleteBiz(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteBiz?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the business and ALL its data: products, sales, purchases,
              expenses, journals, banking, locations, and user roles. The user accounts themselves
              will remain but will be detached from this business. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Business
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddBusinessDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onCreated={() => { setLoading(true); fetchData(); }}
      />
    </div>
  );
}
