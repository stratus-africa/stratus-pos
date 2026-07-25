import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTaxRates, type TaxRate, type TaxRateFormData } from "@/hooks/useTaxRates";

const emptyForm: TaxRateFormData = {
  name: "",
  rate: 0,
  type: "standard",
  exempt_reason: null,
  is_default: false,
  is_active: true,
};

export function TaxRatesTab() {
  const { query, createMutation, updateMutation, deleteMutation } = useTaxRates();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState<TaxRateFormData>(emptyForm);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (r: TaxRate) => {
    setEditing(r);
    setForm({
      name: r.name,
      rate: Number(r.rate),
      type: r.type,
      exempt_reason: r.exempt_reason,
      is_default: r.is_default,
      is_active: r.is_active,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    const payload: TaxRateFormData = {
      ...form,
      rate: form.type === "exempt" || form.type === "zero" ? 0 : Number(form.rate) || 0,
      exempt_reason: form.type === "exempt" ? (form.exempt_reason || "Exempt") : null,
    };
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setOpen(false);
  };

  const rows = query.data || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Tax Rates</CardTitle>
          <CardDescription>
            Define VAT rates used across purchases, sales and invoices (e.g. General 16%, Reduced 8%, Zero 0%, Exempt).
          </CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> New Rate
        </Button>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No tax rates defined yet. Add one to make it selectable on documents.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Rate %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.name}
                    {r.is_default && <Badge variant="secondary" className="ml-2">Default</Badge>}
                  </TableCell>
                  <TableCell className="capitalize">{r.type}</TableCell>
                  <TableCell className="text-right">{Number(r.rate).toFixed(2)}</TableCell>
                  <TableCell>
                    {r.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete tax rate "${r.name}"?`)) deleteMutation.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tax Rate" : "New Tax Rate"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. General Rate"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="reduced">Reduced</SelectItem>
                    <SelectItem value="zero">Zero-rated</SelectItem>
                    <SelectItem value="exempt">Exempt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rate %</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  disabled={form.type === "exempt" || form.type === "zero"}
                  value={form.type === "exempt" || form.type === "zero" ? 0 : form.rate}
                  onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            {form.type === "exempt" && (
              <div className="space-y-2">
                <Label>Exemption Reason</Label>
                <Input
                  value={form.exempt_reason || ""}
                  onChange={(e) => setForm({ ...form, exempt_reason: e.target.value })}
                  placeholder="e.g. Zero-rated export"
                />
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Default rate</Label>
                <p className="text-xs text-muted-foreground">Pre-select this rate on new documents.</p>
              </div>
              <Switch checked={!!form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Only active rates appear in selectors.</p>
              </div>
              <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={createMutation.isPending || updateMutation.isPending || !form.name.trim()}
            >
              {editing ? "Save Changes" : "Create Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
