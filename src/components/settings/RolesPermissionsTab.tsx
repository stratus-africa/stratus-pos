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
import {
  moduleCatalog,
  reportsCatalog,
  permKey,
  defaultRolePermissions,
  roleDescriptions,
  type AppRole,
  CONFIGURED_MARKER,
  type ModuleDef,
  type ModuleAction,
  normalizePermissions,
} from "@/lib/permissions";
import { FEATURE_CATALOG, type FeatureDefinition } from "@/lib/featureCatalog";
import { APP_MODULES } from "@/lib/modules";

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
    case "admin":
      return <Crown className="h-3.5 w-3.5" />;
    case "manager":
      return <Shield className="h-3.5 w-3.5" />;
    case "stores_manager":
      return <Warehouse className="h-3.5 w-3.5" />;
    default:
      return <User className="h-3.5 w-3.5" />;
  }
};

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "admin":
      return "default" as const;
    case "manager":
      return "secondary" as const;
    case "stores_manager":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
};

const moduleLabelMap = Object.fromEntries(APP_MODULES.map((module) => [module.key, module.label]));

// Permission catalog & defaults are defined in @/lib/permissions and shared
// with the runtime usePermissions hook so UI gating stays in sync.

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
  const [activeFeatureKeys, setActiveFeatureKeys] = useState<Set<string>>(new Set());

  const isAdmin = userRole === "admin";

  const fetchPermissions = async () => {
    if (!business) return;

    const [{ data: permissionRows }, { data: featureRows, error: featureError }] = await Promise.all([
      (supabase as any).from("role_permissions").select("role, permission").eq("business_id", business.id),
      supabase
        .from("module_features")
        .select("module_key, feature_key, permission_key, is_active")
        .eq("is_active", true),
    ]);

    if (featureError) {
      console.warn("Failed to load active module features:", featureError);
    }

    const activeKeys = new Set<string>(
      (featureRows || []).map((row: { permission_key: string }) => row.permission_key),
    );
    // Core workspace features remain available even if a seed row is missing.
    for (const feature of FEATURE_CATALOG) {
      if (["dashboard", "settings", "profile"].includes(feature.moduleKey)) {
        activeKeys.add(feature.permissionKey);
      }
    }
    setActiveFeatureKeys(activeKeys);

    const next: Record<AppRole, string[]> = { ...defaultRolePermissions };
    if (permissionRows && permissionRows.length > 0) {
      const seenRoles = new Set<AppRole>();
      permissionRows.forEach((row: { role: AppRole; permission: string }) => {
        if (!seenRoles.has(row.role)) {
          next[row.role] = [];
          seenRoles.add(row.role);
        }
        next[row.role].push(row.permission);
      });
    }
    setRolePermissions(
      Object.fromEntries(
        Object.entries(next).map(([role, permissions]) => [role, normalizePermissions(permissions)]),
      ) as Record<AppRole, string[]>,
    );
  };

  const fetchMembers = async () => {
    if (!business) return;
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id, role")
      .eq("business_id", business.id);

    if (!roles || roles.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const userIds = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    setMembers(
      roles.map((r) => ({
        user_id: r.user_id,
        role_id: r.id,
        role: r.role as AppRole,
        full_name: profileMap.get(r.user_id)?.full_name || null,
        email: profileMap.get(r.user_id)?.email || null,
        phone: profileMap.get(r.user_id)?.phone || null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const openEditMember = (m: TeamMember) => {
    setEditMember(m);
    setEditRole(m.role);
    setEditName(m.full_name || "");
    setEditPhone(m.phone || "");
  };

  const handleSaveUser = async () => {
    if (!editMember) return;
    setSaving(true);
    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ role: editRole })
      .eq("id", editMember.role_id);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: editName.trim(), phone: editPhone.trim() || null })
      .eq("id", editMember.user_id);
    if (roleError || profileError) toast.error("Failed to update: " + (roleError?.message || profileError?.message));
    else {
      toast.success("User updated");
      await fetchMembers();
    }
    setSaving(false);
    setEditMember(null);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    toast.info(`To add ${inviteEmail} as a ${inviteRole}: Have them sign up, then assign their role here.`, {
      duration: 6000,
    });
    setInviting(false);
    setInviteOpen(false);
    setInviteEmail("");
  };

  const openEditRole = (role: AppRole) => {
    setEditingRole(role);
    setEditPerms(normalizePermissions(rolePermissions[role] || []));
  };

  // Cascade rules:
  //   - Enabling edit/delete auto-enables view + create
  //   - Enabling create auto-enables view
  //   - Disabling view/create auto-disables dependent actions
  const togglePerm = (perm: string) => {
    setEditPerms((prev) => {
      const set = new Set(prev);
      const turningOn = !set.has(perm);
      const dot = perm.lastIndexOf(".");
      const modKey = dot > -1 ? perm.slice(0, dot) : "";
      const action = dot > -1 ? perm.slice(dot + 1) : "";
      const mod = moduleCatalog.find((m) => m.key === modKey);

      if (turningOn) {
        set.add(perm);
        if (mod && (action === "create" || action === "edit" || action === "delete")) {
          if (mod.actions.includes("view")) set.add(permKey(mod.key, "view"));
        }
        if (mod && (action === "edit" || action === "delete") && mod.actions.includes("create")) {
          set.add(permKey(mod.key, "create"));
        }
        if (mod && action === "delete" && mod.actions.includes("edit")) {
          set.add(permKey(mod.key, "edit"));
        }
      } else {
        set.delete(perm);
        if (mod && (action === "view" || action === "create")) {
          (action === "view" ? ["create", "edit", "delete"] : (["edit", "delete"] as const)).forEach((a) => {
            if (mod.actions.includes(a as ModuleAction)) set.delete(permKey(mod.key, a as ModuleAction));
          });
        }
      }
      return normalizePermissions(set);
    });
  };

  const toggleModule = (mod: ModuleDef, on: boolean) => {
    const keys = mod.actions.map((a) => permKey(mod.key, a));
    setEditPerms((prev) => (on ? Array.from(new Set([...prev, ...keys])) : prev.filter((p) => !keys.includes(p))));
  };

  const toggleFeature = (feature: FeatureDefinition) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      const enabled = next.has(feature.permissionKey);

      if (enabled) {
        next.delete(feature.permissionKey);
      } else {
        next.add(feature.permissionKey);
        for (const required of feature.requires || []) {
          next.add(required);
        }
      }

      return normalizePermissions(next);
    });
  };

  const toggleFeatureGroup = (features: FeatureDefinition[], enabled: boolean) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      for (const feature of features) {
        if (enabled) {
          next.add(feature.permissionKey);
          for (const required of feature.requires || []) next.add(required);
        } else {
          next.delete(feature.permissionKey);
        }
      }
      return normalizePermissions(next);
    });
  };

  const handleSaveRolePerms = async () => {
    if (!editingRole || !business) return;
    setSavingPerms(true);
    try {
      const { error: delErr } = await (supabase as any)
        .from("role_permissions")
        .delete()
        .eq("business_id", business.id)
        .eq("role", editingRole);
      if (delErr) throw delErr;
      {
        // Preserve legacy permissions that are not part of the new canonical
        // feature catalogue. The feature tree owns all FEATURE_CATALOG keys;
        // older module/report permissions continue working until their screens
        // are migrated to the granular keys.
        const featurePermissionKeys = new Set(FEATURE_CATALOG.map((feature) => feature.permissionKey));
        const legacyPermissions = (rolePermissions[editingRole] || []).filter(
          (permission) => permission !== CONFIGURED_MARKER && !featurePermissionKeys.has(permission),
        );
        const normalizedPerms = normalizePermissions([...legacyPermissions, ...editPerms]);
        const rows = [...normalizedPerms, CONFIGURED_MARKER].map((permission) => ({
          business_id: business.id,
          role: editingRole,
          permission,
        }));
        const { error: insErr } = await (supabase as any).from("role_permissions").insert(rows);
        if (insErr) throw insErr;
      }
      setRolePermissions((prev) => ({ ...prev, [editingRole]: normalizePermissions(editPerms) }));
      toast.success(`${roleDescriptions[editingRole].label} permissions saved`);
      setEditingRole(null);
    } catch (err: any) {
      toast.error("Failed to save permissions: " + err.message);
    } finally {
      setSavingPerms(false);
    }
  };

  const roleCounts = useMemo(
    () => ({
      admin: members.filter((m) => m.role === "admin").length,
      manager: members.filter((m) => m.role === "manager").length,
      cashier: members.filter((m) => m.role === "cashier").length,
      stores_manager: members.filter((m) => m.role === "stores_manager").length,
    }),
    [members],
  );

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
          <TabsTrigger value="members" className="gap-1.5">
            <Users className="h-4 w-4" /> Team Members
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Roles & Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {(["admin", "manager", "stores_manager", "cashier"] as AppRole[]).map((role) => (
              <Card key={role}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {role === "admin" ? (
                        <Crown className="h-4 w-4 text-primary" />
                      ) : role === "manager" ? (
                        <Shield className="h-4 w-4 text-primary" />
                      ) : role === "stores_manager" ? (
                        <Warehouse className="h-4 w-4 text-primary" />
                      ) : (
                        <User className="h-4 w-4 text-primary" />
                      )}
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
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">
                        No team members found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((m) => (
                      <TableRow key={m.user_id}>
                        <TableCell className="font-medium">
                          {m.full_name || "Unnamed User"}
                          {m.user_id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{m.email || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.phone || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={roleBadgeVariant(m.role)}
                            className="flex items-center gap-1 w-fit capitalize"
                          >
                            {roleIcon(m.role)} {m.role.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditMember(m)}
                              disabled={m.user_id === user?.id}
                              title={m.user_id === user?.id ? "You can't change your own role" : "Edit user"}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
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
                        {role === "admin" ? (
                          <Crown className="h-5 w-5 text-primary" />
                        ) : role === "manager" ? (
                          <Shield className="h-5 w-5 text-primary" />
                        ) : role === "stores_manager" ? (
                          <Warehouse className="h-5 w-5 text-primary" />
                        ) : (
                          <User className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-base">{info.label}</CardTitle>
                        <CardDescription>{info.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {roleCounts[role]} user{roleCounts[role] !== 1 ? "s" : ""}
                        </Badge>
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
          <DialogHeader>
            <DialogTitle>Edit User — {editMember?.full_name || "User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={editMember?.email || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
            <Button variant="outline" onClick={() => setEditMember(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature-based Roles Editor */}
      <Sheet open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <SheetContent side="right" className="w-full sm:max-w-5xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {editingRole && roleIcon(editingRole)}
              Edit Permissions — {editingRole && roleDescriptions[editingRole].label}
            </SheetTitle>
            <SheetDescription>
              Assign the same granular feature permissions defined by the Super Admin Module Manager.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-4">
            {editingRole && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
                  <div>
                    <p className="font-medium">Feature permissions</p>
                    <p className="text-xs text-muted-foreground">
                      Only features enabled in the canonical module catalogue are available here.
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {
                      FEATURE_CATALOG.filter((feature) => activeFeatureKeys.has(feature.permissionKey)).filter(
                        (feature) => editPerms.includes(feature.permissionKey),
                      ).length
                    }{" "}
                    selected
                  </Badge>
                </div>

                <div className="space-y-6">
                  {Array.from(
                    new Set(
                      FEATURE_CATALOG.filter((feature) => activeFeatureKeys.has(feature.permissionKey)).map(
                        (feature) => feature.moduleKey,
                      ),
                    ),
                  ).map((moduleKey) => {
                    const moduleFeatures = FEATURE_CATALOG.filter(
                      (feature) => feature.moduleKey === moduleKey && activeFeatureKeys.has(feature.permissionKey),
                    );
                    if (!moduleFeatures.length) return null;

                    const moduleLabel = moduleLabelMap[moduleKey] || moduleKey.replace(/_/g, " ");
                    const categories = Array.from(new Set(moduleFeatures.map((feature) => feature.category)));

                    return (
                      <section key={moduleKey} className="space-y-3 rounded-xl border p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-semibold capitalize">{moduleLabel}</h3>
                            <p className="text-xs text-muted-foreground">{moduleFeatures.length} available features</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleFeatureGroup(moduleFeatures, true)}
                            >
                              Enable all
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleFeatureGroup(moduleFeatures, false)}>
                              Clear
                            </Button>
                          </div>
                        </div>

                        {categories.map((category) => {
                          const categoryFeatures = moduleFeatures.filter((feature) => feature.category === category);
                          return (
                            <div key={category} className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {category.replace(/_/g, " ")}
                              </div>
                              <div className="grid gap-2 md:grid-cols-2">
                                {categoryFeatures.map((feature) => {
                                  const checked = editPerms.includes(feature.permissionKey);
                                  const riskClass =
                                    feature.risk === "critical"
                                      ? "border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20"
                                      : feature.risk === "high"
                                        ? "border-orange-200 bg-orange-50/30 dark:border-orange-900 dark:bg-orange-950/20"
                                        : "";

                                  return (
                                    <label
                                      key={feature.permissionKey}
                                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 ${riskClass}`}
                                    >
                                      <Checkbox checked={checked} onCheckedChange={() => toggleFeature(feature)} />
                                      <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                          {feature.label}
                                          {feature.risk !== "low" && (
                                            <Badge variant="outline" className="text-[9px] uppercase">
                                              {feature.risk}
                                            </Badge>
                                          )}
                                        </span>
                                        <span className="mt-1 block text-xs text-muted-foreground">
                                          {feature.description}
                                        </span>
                                        <span className="mt-1 block font-mono text-[9px] text-muted-foreground/70">
                                          {feature.permissionKey}
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  High-risk and critical permissions should normally be reserved for managers or administrators. Role
                  permissions do not override plan/module entitlement.
                </div>
              </>
            )}
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingRole(null)}>
              Cancel
            </Button>
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
