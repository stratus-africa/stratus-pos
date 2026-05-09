import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, ShieldOff, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  business_id: string | null;
  created_at: string;
  business_name?: string;
  role?: string;
  is_super_admin?: boolean;
}

interface BusinessOption {
  id: string;
  name: string;
}

export default function SuperAdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [superAdminIds, setSuperAdminIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  const fetchUsers = async () => {
    const [profilesRes, superRes, rolesRes, bizRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("super_admins").select("user_id"),
      supabase.from("user_roles").select("user_id, role, business_id"),
      supabase.from("businesses").select("id, name"),
    ]);

    const saIds = new Set((superRes.data || []).map((s) => s.user_id));
    setSuperAdminIds(saIds);

    const bizList = bizRes.data || [];
    setBusinesses(bizList);
    const bizMap = new Map(bizList.map((b) => [b.id, b.name]));
    const roleMap = new Map((rolesRes.data || []).map((r) => [r.user_id, r.role]));

    const enriched: UserRow[] = (profilesRes.data || []).map((p: any) => ({
      ...p,
      business_name: p.business_id ? bizMap.get(p.business_id) || "Unknown" : undefined,
      role: roleMap.get(p.id) || undefined,
      is_super_admin: saIds.has(p.id),
    }));

    setUsers(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleSuperAdmin = async (userId: string, currentlySuper: boolean) => {
    if (userId === currentUser?.id) {
      toast.error("You cannot remove your own super admin status");
      return;
    }

    if (currentlySuper) {
      const { error } = await supabase.from("super_admins").delete().eq("user_id", userId);
      if (error) { toast.error("Failed to remove super admin"); return; }
      toast.success("Super admin access removed");
    } else {
      const { error } = await supabase.from("super_admins").insert({ user_id: userId });
      if (error) { toast.error("Failed to grant super admin"); return; }
      toast.success("Super admin access granted");
    }
    fetchUsers();
  };

  const filtered = users.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase());
    const matchesBiz = filterBusiness === "all" || u.business_id === filterBusiness;
    const matchesRole =
      filterRole === "all" ||
      (filterRole === "super_admin" ? u.is_super_admin : u.role === filterRole);
    return matchesSearch && matchesBiz && matchesRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Users</h1>
        <p className="text-muted-foreground">{users.length} registered users</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterBusiness} onValueChange={setFilterBusiness}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Businesses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Businesses</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="cashier">Cashier</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || "Unnamed"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email || "—"}</TableCell>
                  <TableCell>{u.business_name || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    {u.role ? (
                      <Badge variant="outline" className="capitalize">{u.role}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.is_super_admin && (
                      <Badge className="bg-red-500/10 text-red-600 border-red-200">
                        <Shield className="h-3 w-3 mr-1" />
                        Super Admin
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(u.created_at), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={u.is_super_admin ? "destructive" : "outline"}
                      size="sm"
                      disabled={u.id === currentUser?.id}
                      onClick={() => toggleSuperAdmin(u.id, !!u.is_super_admin)}
                    >
                      {u.is_super_admin ? (
                        <><ShieldOff className="h-3 w-3 mr-1" /> Revoke</>
                      ) : (
                        <><Shield className="h-3 w-3 mr-1" /> Grant</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {search || filterBusiness !== "all" || filterRole !== "all"
                      ? "No users match your filters"
                      : "No users registered yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
