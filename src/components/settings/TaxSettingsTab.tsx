import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTaxRates, type TaxRate, type TaxRateFormData } from "@/hooks/useTaxRates";
import { Plus, Pencil, Trash2, Lock, Save, Loader2, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EXEMPT_REASONS = ["Out of Scope", "Not Taxable"];

export function TaxSettingsTab() {
  const { business, refreshBusiness } = useBusiness();
  const { query, createMutation, updateMutation, deleteMutation } = useTaxRates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState<TaxRateFormData>({
    name: "",
    rate: 0,
    type: "standard",
    exempt_reason: null,
  });

  // PIN field state
  const [pin, setPin] = useState(business?.kra_pin || "");
  const [savingPin, setSavingPin] = useState(false);
  const [hasVatTransactions, setHasVatTransactions] = useState(false);
  const [checkingVat, setCheckingVat] = useState(true);

  useEffect(() => {
    setPin(business?.kra_pin || "");
  }, [business?.kra_pin]);

  // Check if any VAT transactions exist (sales with tax > 0 OR purchases with vat_enabled)
  useEffect(() => {
    let cancelled = false;
    const checkVat = async () => {
      if (!business) return;
      setCheckingVat(true);
      const [salesRes, purchasesRes] = await Promise.all([
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("business_id", business.id).gt("tax", 0),
        supabase.from("purchases").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("vat_enabled", true),
      ]);
      if (cancelled) return;
      const has = ((salesRes.count ?? 0) + (purchasesRes.count ?? 0)) > 0;
      setHasVatTransactions(has);
      setCheckingVat(false);
    };
    checkVat();
    return () => { cancelled = true; };
  }, [business?.id]);

  const pinLocked = hasVatTransactions && !!business?.kra_pin?.trim();

  const handleSavePin = async () => {
    if (!business) return;
    if (!pin.trim()) {
      if (pinLocked) {
        toast.error("PIN cannot be removed: VAT transactions exist. Delete those first.");
        return;
      }
    }
    setSavingPin(true);
    const { error } = await supabase
      .from("businesses")
      .update({ kra_pin: pin.trim() || null } as never)
      .eq("id", business.id);
    if (error) {
      toast.error("Failed to update PIN: " + error.message);
    } else {
      toast.success("PIN updated");
      await refreshBusiness();
    }
    setSavingPin(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", rate: 0, type: "standard", exempt_reason: null });
    setDialogOpen(true);
  };

  const openEdit = (tr: TaxRate) => {
    setEditing(tr);
    setForm({ name: tr.name, rate: tr.rate, type: tr.type, exempt_reason: tr.exempt_reason });
    setDialogOpen(true);
  };

  const handleTypeChange = (type: string) => {
    if (type === "standard") setForm({ ...form, type, rate: 16, exempt_reason: null });
    else if (type === "zero") setForm({ ...form, type, rate: 0, exempt_reason: null });
    else setForm({ ...form, type, rate: 0, exempt_reason: form.exempt_reason || "Out of Scope" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...form }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createMutation.mutate(form, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const typeLabel = (type: string) => {
    if (type === "standard") return "Standard";
    if (type === "zero") return "Zero Rate";
    return "Exempt";
  };

  const typeBadgeVariant = (type: string) => {
    if (type === "standard") return "default" as const;
    if (type === "zero") return "secondary" as const;
    return "outline" as const;
  };

  return (
    <div className="space-y-6">
      {/* PIN Card — only when VAT enabled */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Tax Identification (PIN)
          </CardTitle>
          <CardDescription>
            Required when VAT is enabled. Used on tax invoices and reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="biz-pin" className="flex items-center gap-2">
              PIN <span className="text-destructive">*</span>
              {pinLocked && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              )}
            </Label>
            <Input
              id="biz-pin"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="e.g. P051234567X"
              disabled={pinLocked || checkingVat}
              required
            />
            <p className="text-xs text-muted-foreground">
              {pinLocked
                ? "PIN cannot be changed because VAT transactions have been recorded. Delete those VAT sales/purchases first to unlock."
                : "Enter the tax identification number for this business."}
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSavePin} disabled={savingPin || pinLocked || pin === (business?.kra_pin || "")}>
              {savingPin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save PIN
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tax Rates Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tax Rates</CardTitle>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Tax Rate</Button>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (query.data?.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No tax rates configured. Click "Add Tax Rate" to set up Standard (16%), Zero (0%), and Exempt rates.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Exempt Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.map((tr) => (
                  <TableRow key={tr.id}>
                    <TableCell className="font-medium">{tr.name}</TableCell>
                    <TableCell><Badge variant={typeBadgeVariant(tr.type)}>{typeLabel(tr.type)}</Badge></TableCell>
                    <TableCell className="text-right">{tr.rate}%</TableCell>
                    <TableCell className="text-muted-foreground">{tr.exempt_reason || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(tr)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(tr.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Tax Rate" : "Add Tax Rate"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Rate" required />
              </div>

              <div className="space-y-2">
                <Label>Tax Type *</Label>
                <Select value={form.type} onValueChange={handleTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard Rate (16%)</SelectItem>
                    <SelectItem value="zero">Zero Rate (0%)</SelectItem>
                    <SelectItem value="exempt">Exempt (0%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.type === "standard" && (
                <div className="space-y-2">
                  <Label>Rate (%)</Label>
                  <Input type="number" min={0} step={0.01} value={form.rate} onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })} />
                </div>
              )}

              {form.type === "exempt" && (
                <div className="space-y-2">
                  <Label>Reason for Exemption *</Label>
                  <Select value={form.exempt_reason || ""} onValueChange={(v) => setForm({ ...form, exempt_reason: v })}>
                    <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      {EXEMPT_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editing ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
