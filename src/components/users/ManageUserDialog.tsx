import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type AppRole = "admin" | "manager" | "cashier" | "stores_manager";

export interface UserDialogValues {
  user_id?: string;
  email: string;
  full_name: string;
  phone: string;
  role: AppRole;
  is_active: boolean;
  assigned_location_id: string | null;
}

interface LocationLite { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  businessId: string;
  initial?: Partial<UserDialogValues>;
  locations?: LocationLite[];
  onSaved: () => void;
}

export default function ManageUserDialog({
  open, onOpenChange, mode, businessId, initial, locations = [], onSaved,
}: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AppRole>("cashier");
  const [active, setActive] = useState(true);
  const [locationId, setLocationId] = useState<string>("none");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(initial?.email || "");
    setFullName(initial?.full_name || "");
    setPhone(initial?.phone || "");
    setRole((initial?.role as AppRole) || "cashier");
    setActive(initial?.is_active ?? true);
    setLocationId(initial?.assigned_location_id || "none");
    setPassword("");
    setConfirm("");
  }, [open, initial]);

  const handleSave = async () => {
    if (mode === "create") {
      if (!email.trim() || !password) { toast.error("Email and password required"); return; }
      if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
      if (password !== confirm) { toast.error("Passwords do not match"); return; }
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: {
        action: mode === "create" ? "create_user" : "update_user",
        business_id: businessId,
        user_id: initial?.user_id,
        email: email.trim(),
        password: mode === "create" ? password : undefined,
        full_name: fullName.trim(),
        phone: phone.trim(),
        role,
        is_active: active,
        assigned_location_id: locationId === "none" ? null : locationId,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed");
      return;
    }
    toast.success(mode === "create" ? "User created" : "User updated");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create User" : "Edit User"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new team member with login credentials."
              : "Update the user's details and role."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254..." />
          </div>
          {mode === "create" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 chars" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — Full access</SelectItem>
                <SelectItem value="manager">Manager — Operations</SelectItem>
                <SelectItem value="stores_manager">Stores Manager — Stock & inventory</SelectItem>
                <SelectItem value="cashier">Cashier — POS only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {locations.length > 0 && (
            <div className="space-y-1.5">
              <Label>Assigned Till / Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific till</SelectItem>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">Inactive users cannot sign in.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create User" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ResetPasswordProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  businessId: string;
  userId: string;
  userLabel: string;
}

export function SetPasswordDialog({ open, onOpenChange, businessId, userId, userLabel }: ResetPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setPassword(""); setConfirm(""); } }, [open]);

  const handleSave = async () => {
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-manage-user", {
      body: { action: "set_password", business_id: businessId, user_id: userId, password },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed");
      return;
    }
    toast.success("Password updated");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>Set a new password for <strong>{userLabel}</strong>.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 chars" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm Password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
