import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, MapPin } from "lucide-react";

interface LocationForm {
  name: string;
  type: string;
  address: string;
  is_active: boolean;
  /** null = inherit business default, true/false = override */
  pos_require_manager_to_remove_item: boolean | null;
}

const emptyForm: LocationForm = {
  name: "",
  type: "store",
  address: "",
  is_active: true,
  pos_require_manager_to_remove_item: null,
};

export function LocationsTab() {
  const { business, locations, refreshBusiness } = useBusiness();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (loc: any) => {
    setEditId(loc.id);
    setForm({
      name: loc.name,
      type: loc.type,
      address: loc.address || "",
      is_active: loc.is_active,
      pos_require_manager_to_remove_item: loc.pos_require_manager_to_remove_item ?? null,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!business || !form.name.trim()) return;
    setSaving(true);

    if (editId) {
      const { error } = await supabase
        .from("locations")
        .update({
          name: form.name.trim(),
          type: form.type,
          address: form.address || null,
          is_active: form.is_active,
          pos_require_manager_to_remove_item: form.pos_require_manager_to_remove_item,
        } as never)
        .eq("id", editId);
      if (error) toast.error(error.message);
      else toast.success("Location updated");
    } else {
      const { error } = await supabase
        .from("locations")
        .insert({
          business_id: business.id,
          name: form.name.trim(),
          type: form.type,
          address: form.address || null,
          pos_require_manager_to_remove_item: form.pos_require_manager_to_remove_item,
        } as never);
      if (error) toast.error(error.message);
      else toast.success("Location added");
    }

    await refreshBusiness();
    setSaving(false);
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Locations</CardTitle>
          <CardDescription>Manage stores, warehouses, and other locations.</CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Add Location
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No locations yet.
                </TableCell>
              </TableRow>
            )}
            {locations.map((loc) => (
              <TableRow key={loc.id}>
                <TableCell className="font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {loc.name}
                </TableCell>
                <TableCell className="capitalize">{loc.type}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{loc.address || "—"}</TableCell>
                <TableCell>
                  <Badge variant={loc.is_active ? "default" : "secondary"}>
                    {loc.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(loc)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Store" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">Store</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
            </div>
            {editId && (
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <Label>Manager approval to remove POS items</Label>
              <Select
                value={form.pos_require_manager_to_remove_item === null ? "inherit" : form.pos_require_manager_to_remove_item ? "required" : "not_required"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    pos_require_manager_to_remove_item: v === "inherit" ? null : v === "required",
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit from business default</SelectItem>
                  <SelectItem value="required">Required at this location</SelectItem>
                  <SelectItem value="not_required">Not required at this location</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Overrides the business-wide setting only for this location.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
