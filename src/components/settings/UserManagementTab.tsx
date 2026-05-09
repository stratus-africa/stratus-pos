import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Shield, User, Crown, Pencil, Warehouse, Key } from "lucide-react";
import ManageUserDialog, { SetPasswordDialog, AppRole } from "@/components/users/ManageUserDialog";

interface TeamMember {
  user_id: string;
  role_id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  assigned_location_id: string | null;
}

interface LocationLite { id: string; name: string; }

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

export function UserManagementTab() {
  const { business, userRole } = useBusiness();
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [pwUser, setPwUser] = useState<TeamMember | null>(null);

  const isAdmin = userRole === "admin";

  const fetchAll = async () => {
    if (!business) return;
    setLoading(true);

    const [{ data: roles }, { data: locs }] = await Promise.all([
      supabase.from("user_roles").select("id, user_id, role").eq("business_id", business.id),
      supabase.from("locations").select("id, name").eq("business_id", business.id).eq("is_active", true).order("name"),
    ]);

    setLocations((locs || []) as LocationLite[]);

    if (!roles || roles.length === 0) {
      setMembers([]); setLoading(false); return;
    }

    const userIds = roles.map((r) => r.user_id);
    const { data: profiles } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, email, phone, is_active, assigned_location_id")
      .in("id", userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    setMembers(
      roles.map((r) => {
        const p: any = profileMap.get(r.user_id);
        return {
          user_id: r.user_id,
          role_id: r.id,
          role: r.role as AppRole,
          full_name: p?.full_name || null,
          email: p?.email || null,
          phone: p?.phone || null,
          is_active: p?.is_active ?? true,
          assigned_location_id: p?.assigned_location_id || null,
        };
      })
    );
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [business?.id]);

  const toggleActive = async (m: TeamMember, next: boolean) => {
    if (m.user_id === user?.id) {
      toast.error("You can't deactivate yourself");
      return;
    }
    const { error } = await (supabase as any).from("profiles").update({ is_active: next }).eq("id", m.user_id);
    if (error) toast.error("Failed: " + error.message);
    else { toast.success(next ? "User activated" : "User deactivated"); fetchAll(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Users in this Tenant</CardTitle>
          <CardDescription>All team members with access to this business.</CardDescription>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Add User
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Assigned Till</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="w-[160px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : members.length === 0 ? (
              <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">No team members found.</TableCell></TableRow>
            ) : members.map((m) => {
              const loc = locations.find((l) => l.id === m.assigned_location_id);
              return (
                <TableRow key={m.user_id} className={!m.is_active ? "opacity-60" : ""}>
                  <TableCell className="font-medium">
                    {m.full_name || "Unnamed User"}
                    {m.user_id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(m.role)} className="flex items-center gap-1 w-fit capitalize">
                      {roleIcon(m.role)} {m.role.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{loc?.name || "—"}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={m.is_active}
                          onCheckedChange={(v) => toggleActive(m, v)}
                          disabled={m.user_id === user?.id}
                        />
                        <span className="text-xs text-muted-foreground">{m.is_active ? "Active" : "Inactive"}</span>
                      </div>
                    ) : (
                      <Badge variant={m.is_active ? "outline" : "secondary"} className={m.is_active ? "text-emerald-600 border-emerald-200 bg-emerald-50" : ""}>
                        {m.is_active ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(m)} disabled={m.user_id === user?.id} title={m.user_id === user?.id ? "You can't edit yourself here" : "Edit user"}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPwUser(m)} title="Reset password">
                          <Key className="h-3.5 w-3.5 mr-1" /> Password
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      {business && (
        <>
          <ManageUserDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            businessId={business.id}
            locations={locations}
            onSaved={fetchAll}
          />
          <ManageUserDialog
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
            mode="edit"
            businessId={business.id}
            locations={locations}
            initial={editing ? {
              user_id: editing.user_id,
              email: editing.email || "",
              full_name: editing.full_name || "",
              phone: editing.phone || "",
              role: editing.role,
              is_active: editing.is_active,
              assigned_location_id: editing.assigned_location_id,
            } : undefined}
            onSaved={fetchAll}
          />
          {pwUser && (
            <SetPasswordDialog
              open={!!pwUser}
              onOpenChange={(o) => !o && setPwUser(null)}
              businessId={business.id}
              userId={pwUser.user_id}
              userLabel={pwUser.full_name || pwUser.email || "user"}
            />
          )}
        </>
      )}
    </Card>
  );
}
