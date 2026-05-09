import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Shield, User, Crown, Pencil, Loader2, Users, ShieldCheck, Warehouse, Save } from "lucide-react";

type AppRole = "admin" | "manager" | "cashier" | "stores_manager";

interface TeamMember {
  user_id: string;
  role_id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

const roleIcon = (role: string) => {
  switch (role) {
    case "admin": return <Crown className="h-3.5 w-3.5" />;
    case "manager": return <Shield className="h-3.5 w-3.5" />;
    case "stores_manager": return <Warehouse className="h-3.5 w-3.5" />;
    default: return <User className="h-3.5 w-3.5" />;
  }
};

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "admin": return "default" as const;
    case "manager": return "secondary" as const;
    case "stores_manager": return "secondary" as const;
    default: return "outline" as const;
  }
};

// Granular permission catalog: modules with CRUD actions, plus per-report view permissions
type ModuleDef = { key: string; label: string; actions: ("view" | "create" | "edit" | "delete")[] };

const moduleCatalog: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard & Analytics", actions: ["view"] },
  { key: "pos", label: "Point of Sale (POS)", actions: ["view", "create"] },
  { key: "products", label: "Products", actions: ["view", "create", "edit", "delete"] },
  { key: "inventory", label: "Inventory", actions: ["view", "create", "edit", "delete"] },
  { key: "sales", label: "Sales", actions: ["view", "create", "edit", "delete"] },
  { key: "customers", label: "Customers", actions: ["view", "create", "edit", "delete"] },
  { key: "purchases", label: "Purchases", actions: ["view", "create", "edit", "delete"] },
  { key: "suppliers", label: "Suppliers", actions: ["view", "create", "edit", "delete"] },
  { key: "expenses", label: "Expenses", actions: ["view", "create", "edit", "delete"] },
  { key: "banking", label: "Banking & Reconciliation", actions: ["view", "create", "edit", "delete"] },
  { key: "chart_of_accounts", label: "Chart of Accounts", actions: ["view", "create", "edit", "delete"] },
  { key: "settings", label: "Settings & Business Profile", actions: ["view", "edit"] },
  { key: "users", label: "User Management", actions: ["view", "create", "edit", "delete"] },
  { key: "roles", label: "Roles Management", actions: ["view", "edit"] },
];

const reportsCatalog = [
  { key: "report.sales", label: "Sales Report" },
  { key: "report.purchases", label: "Purchases Report" },
  { key: "report.expenses", label: "Expenses Report" },
  { key: "report.inventory", label: "Inventory Report" },
  { key: "report.pnl", label: "Profit & Loss Report" },
  { key: "report.audit", label: "Audit Trail Report" },
];

const permKey = (moduleKey: string, action: string) => `${moduleKey}.${action}`;
const allModulePerms = moduleCatalog.flatMap((m) => m.actions.map((a) => permKey(m.key, a)));
const allReportPerms = reportsCatalog.map((r) => r.key);
const allPermissionKeys = [...allModulePerms, ...allReportPerms];

const defaultRolePermissions: Record<AppRole, string[]> = {
  admin: [...allPermissionKeys],
  manager: [
    "dashboard.view",
    "pos.view", "pos.create",
    "products.view", "products.edit",
    "inventory.view", "inventory.edit",
    "sales.view", "sales.create", "sales.edit",
    "customers.view", "customers.create", "customers.edit",
    "purchases.view", "purchases.create", "purchases.edit",
    "suppliers.view", "suppliers.create", "suppliers.edit",
    "report.sales", "report.purchases", "report.inventory",
  ],
  cashier: [
    "pos.view", "pos.create",
    "customers.view", "customers.create",
  ],
  stores_manager: [
    "products.view", "products.create", "products.edit",
    "inventory.view", "inventory.create", "inventory.edit",
    "purchases.view", "purchases.create", "purchases.edit",
    "suppliers.view", "suppliers.create", "suppliers.edit",
    "report.inventory", "report.purchases",
  ],
};

const roleDescriptions: Record<AppRole, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Full access to all features and settings." },
  manager: { label: "Manager", description: "Day-to-day operations management." },
  cashier: { label: "Cashier", description: "POS-only access for processing sales." },
  stores_manager: { label: "Stores Manager", description: "Manages stock, purchases and inventory operations." },
};

export function RolesPermissionsTab() {
  const { business, userRole } = useBusiness();
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("cashier");
  const [inviting, setInviting] = useState(false);

  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<AppRole>("cashier");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Roles editor (full-screen Sheet)
  const [editingRole, setEditingRole] = useState<AppRole | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const [rolePermissions, setRolePermissions] = useState<Record<AppRole, string[]>>(defaultRolePermissions);

  const isAdmin = userRole === "admin";

  const fetchPermissions = async () => {
    if (!business) return;
    const { data } = await (supabase as any)
      .from("role_permissions")
      .select("role, permission")
      .eq("business_id", business.id);
    const next: Record<AppRole, string[]> = { ...defaultRolePermissions };
    if (data && data.length > 0) {
      const seenRoles = new Set<AppRole>();
      data.forEach((row: { role: AppRole; permission: string }) => {
        if (!seenRoles.has(row.role)) {
          next[row.role] = [];
          seenRoles.add(row.role);
        }
        next[row.role].push(row.permission);
      });
    }
    setRolePermissions(next);
  };

  const fetchMembers = async () => {
    if (!business) return;
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id, role")
      .eq("business_id", business.id);

    if (!roles || roles.length === 0) {
      setMembers([]); setLoading(false); return;
    }

    const userIds = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    setMembers(
      roles.map((r) => ({
        user_id: r.user_id,
        role_id: r.id,
        role: r.role as AppRole,
        full_name: profileMap.get(r.user_id)?.full_name || null,
        email: profileMap.get(r.user_id)?.email || null,
        phone: profileMap.get(r.user_id)?.phone || null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const openEditMember = (m: TeamMember) => {
    setEditMember(m); setEditRole(m.role);
    setEditName(m.full_name || ""); setEditPhone(m.phone || "");
  };

  const handleSaveUser = async () => {
    if (!editMember) return;
    setSaving(true);
    const { error: roleError } = await supabase.from("user_roles").update({ role: editRole }).eq("id", editMember.role_id);
    const { error: profileError } = await supabase.from("profiles").update({ full_name: editName.trim(), phone: editPhone.trim() || null }).eq("id", editMember.user_id);
    if (roleError || profileError) toast.error("Failed to update: " + (roleError?.message || profileError?.message));
    else { toast.success("User updated"); await fetchMembers(); }
    setSaving(false); setEditMember(null);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    toast.info(`To add ${inviteEmail} as a ${inviteRole}: Have them sign up, then assign their role here.`, { duration: 6000 });
    setInviting(false); setInviteOpen(false); setInviteEmail("");
  };

  const openEditRole = (role: AppRole) => {
    setEditingRole(role);
    setEditPerms([...(rolePermissions[role] || [])]);
  };

  const togglePerm = (perm: string) => {
    setEditPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  };

  const toggleModule = (mod: ModuleDef, on: boolean) => {
    const keys = mod.actions.map((a) => permKey(mod.key, a));
    setEditPerms((prev) => on
      ? Array.from(new Set([...prev, ...keys]))
      : prev.filter((p) => !keys.includes(p))
    );
  };

  const handleSaveRolePerms = async () => {
    if (!editingRole || !business) return;
    setSavingPerms(true);
    try {
      const { error: delErr } = await (supabase as any).from("role_permissions").delete().eq("business_id", business.id).eq("role", editingRole);
      if (delErr) throw delErr;
      if (editPerms.length > 0) {
        const rows = editPerms.map((permission) => ({ business_id: business.id, role: editingRole, permission }));
        const { error: insErr } = await (supabase as any).from("role_permissions").insert(rows);
        if (insErr) throw insErr;
      }
      setRolePermissions((prev) => ({ ...prev, [editingRole]: editPerms }));
      toast.success(`${roleDescriptions[editingRole].label} permissions saved`);
      setEditingRole(null);
    } catch (err: any) {
      toast.error("Failed to save permissions: " + err.message);
    } finally { setSavingPerms(false); }
  };

  const roleCounts = useMemo(() => ({
    admin: members.filter((m) => m.role === "admin").length,
    manager: members.filter((m) => m.role === "manager").length,
    cashier: members.filter((m) => m.role === "cashier").length,
    stores_manager: members.filter((m) => m.role === "stores_manager").length,
  }), [members]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Manage team members, roles and granular permissions.</p>
        {isAdmin && (
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="mr-2 h-4 w-4" /> Add Member
          </Button>
        )}
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members" className="gap-1.5"><Users className="h-4 w-4" /> Team Members</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><ShieldCheck className="h-4 w-4" /> Roles & Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {(["admin", "manager", "stores_manager", "cashier"] as AppRole[]).map((role) => (
              <Card key={role}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {role === "admin" ? <Crown className="h-4 w-4 text-primary" /> :
                       role === "manager" ? <Shield className="h-4 w-4 text-primary" /> :
                       role === "stores_manager" ? <Warehouse className="h-4 w-4 text-primary" /> :
                       <User className="h-4 w-4 text-primary" />}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{roleDescriptions[role].label}s</p>
                      <p className="text-lg font-bold">{roleCounts[role]}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    {isAdmin && <TableHead className="w-[60px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : members.length === 0 ? (
                    <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">No team members found.</TableCell></TableRow>
                  ) : members.map((m) => (
                    <TableRow key={m.user_id}>
                      <TableCell className="font-medium">
                        {m.full_name || "Unnamed User"}
                        {m.user_id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{m.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(m.role)} className="flex items-center gap-1 w-fit capitalize">
                          {roleIcon(m.role)} {m.role.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => openEditMember(m)} disabled={m.user_id === user?.id} title={m.user_id === user?.id ? "You can't change your own role" : "Edit user"}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <div className="grid gap-4">
            {(["admin", "manager", "stores_manager", "cashier"] as AppRole[]).map((role) => {
              const info = roleDescriptions[role];
              const perms = rolePermissions[role] || [];
              return (
                <Card key={role}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        {role === "admin" ? <Crown className="h-5 w-5 text-primary" /> :
                         role === "manager" ? <Shield className="h-5 w-5 text-primary" /> :
                         role === "stores_manager" ? <Warehouse className="h-5 w-5 text-primary" /> :
                         <User className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-base">{info.label}</CardTitle>
                        <CardDescription>{info.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{roleCounts[role]} user{roleCounts[role] !== 1 ? "s" : ""}</Badge>
                        <Badge variant="outline">{perms.length} perms</Badge>
                        {isAdmin && role !== "admin" && (
                          <Button variant="outline" size="sm" onClick={() => openEditRole(role)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Member Dialog */}
      <Dialog open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User — {editMember?.full_name || "User"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Full Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={editMember?.email || ""} disabled className="bg-muted" /></div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — Full access</SelectItem>
                  <SelectItem value="manager">Manager — Operations</SelectItem>
                  <SelectItem value="stores_manager">Stores Manager — Stock & inventory</SelectItem>
                  <SelectItem value="cashier">Cashier — POS only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={handleSaveUser} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@example.com" /></div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="stores_manager">Stores Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>Send Invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-screen Roles Editor (Sheet) */}
      <Sheet open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {editingRole && roleIcon(editingRole)}
              Edit Permissions — {editingRole && roleDescriptions[editingRole].label}
            </SheetTitle>
            <SheetDescription>
              Toggle individual View / Create / Edit / Delete permissions per module, plus per-report visibility.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-4">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Modules</h3>
                <div className="text-xs text-muted-foreground">{editPerms.filter(p => !p.startsWith("report.")).length} selected</div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead className="text-center w-20">View</TableHead>
                      <TableHead className="text-center w-20">Create</TableHead>
                      <TableHead className="text-center w-20">Edit</TableHead>
                      <TableHead className="text-center w-20">Delete</TableHead>
                      <TableHead className="text-center w-16">All</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moduleCatalog.map((mod) => {
                      const allOn = mod.actions.every((a) => editPerms.includes(permKey(mod.key, a)));
                      return (
                        <TableRow key={mod.key}>
                          <TableCell className="font-medium">{mod.label}</TableCell>
                          {(["view", "create", "edit", "delete"] as const).map((a) => {
                            const supported = mod.actions.includes(a);
                            const k = permKey(mod.key, a);
                            return (
                              <TableCell key={a} className="text-center">
                                {supported ? (
                                  <Checkbox checked={editPerms.includes(k)} onCheckedChange={() => togglePerm(k)} />
                                ) : (
                                  <span className="text-xs text-muted-foreground/50">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">
                            <Checkbox checked={allOn} onCheckedChange={(v) => toggleModule(mod, !!v)} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Reports — allow viewing each report</h3>
                <div className="text-xs text-muted-foreground">{editPerms.filter(p => p.startsWith("report.")).length} of {reportsCatalog.length}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-lg p-3">
                {reportsCatalog.map((r) => (
                  <label key={r.key} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                    <Checkbox checked={editPerms.includes(r.key)} onCheckedChange={() => togglePerm(r.key)} />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingRole(null)}>Cancel</Button>
            <Button onClick={handleSaveRolePerms} disabled={savingPerms}>
              {savingPerms ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save Permissions
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
