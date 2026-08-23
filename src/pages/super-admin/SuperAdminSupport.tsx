import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Search, ShieldCheck, UserRoundCheck, ExternalLink, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { startSupportSession } from "@/lib/supportImpersonation.functions";

interface Tenant {
  id: string;
  name: string;
  is_active: boolean;
}
interface TenantAdmin {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
}

export default function SuperAdminSupport() {
  const callStart = useServerFn(startSupportSession);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [adminId, setAdminId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    supabase
      .from("businesses")
      .select("id, name, is_active")
      .order("name")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setTenants((data || []) as Tenant[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!tenantId) {
      setAdmins([]);
      setAdminId("");
      return;
    }
    setLoadingAdmins(true);
    Promise.all([
      supabase.from("user_roles").select("user_id").eq("business_id", tenantId).eq("role", "admin"),
      supabase.from("profiles").select("id, full_name, email, is_active").eq("business_id", tenantId),
    ]).then(([rolesRes, profilesRes]) => {
      if (rolesRes.error) toast.error(rolesRes.error.message);
      const ids = new Set((rolesRes.data || []).map((r: any) => r.user_id));
      setAdmins(((profilesRes.data || []) as TenantAdmin[]).filter((p) => ids.has(p.id)));
      setAdminId("");
      setLoadingAdmins(false);
    });
  }, [tenantId]);

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [tenants, search]);

  const selectedTenant = tenants.find((t) => t.id === tenantId);
  const selectedAdmin = admins.find((a) => a.id === adminId);

  const begin = async () => {
    if (!selectedTenant || !selectedAdmin) return;
    setStarting(true);
    try {
      const result = await callStart({ data: { business_id: selectedTenant.id, target_user_id: selectedAdmin.id } });
      const url = `${window.location.origin}/support/consume?token_hash=${encodeURIComponent(result.token_hash)}&support_session_id=${encodeURIComponent(result.support_session_id)}`;
      const popup = window.open("about:blank", "stratuspos-support");
      if (!popup) {
        toast.error("Your browser blocked the support window. Allow pop-ups and try again.");
        return;
      }
      popup.opener = null;
      popup.location.href = url;
      toast.success(`Support session started for ${selectedTenant.name}`);
    } catch (error: any) {
      toast.error(error?.message || "Could not start support session");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Support / Impersonation</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Securely enter a tenant admin session without replacing your Super Admin session.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Protected support mode</AlertTitle>
        <AlertDescription>
          Support opens in a separate tab, expires after 60 minutes, and records start/end events against the Super
          Admin and tenant.
        </AlertDescription>
      </Alert>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Select tenant</CardTitle>
            <CardDescription>Only active tenants can be entered through support mode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tenants…"
              />
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {loading ? (
                <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin" />
              ) : (
                filteredTenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    type="button"
                    disabled={!tenant.is_active}
                    onClick={() => setTenantId(tenant.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${tenant.id === tenantId ? "border-primary bg-primary/5" : "hover:bg-muted/50"} ${!tenant.is_active ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{tenant.name}</span>
                      <Badge variant={tenant.is_active ? "outline" : "secondary"}>
                        {tenant.is_active ? "Active" : "Suspended"}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Select tenant administrator</CardTitle>
            <CardDescription>
              {selectedTenant ? `Administrators for ${selectedTenant.name}` : "Select a tenant first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingAdmins ? (
              <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin" />
            ) : (
              <div className="space-y-2">
                {admins.length === 0 && selectedTenant && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No tenant administrators found.</p>
                )}
                {admins.map((admin) => (
                  <button
                    key={admin.id}
                    type="button"
                    disabled={!admin.is_active}
                    onClick={() => setAdminId(admin.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${admin.id === adminId ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                        <UserRoundCheck className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{admin.full_name || "Tenant Admin"}</p>
                        <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
                      </div>
                      {!admin.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <Separator />
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Clock3 className="h-4 w-4" /> Session duration
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                60 minutes maximum. A new support session revokes an existing session for the same tenant admin.
              </p>
            </div>
            <Button className="w-full" disabled={!selectedTenant || !selectedAdmin || starting} onClick={begin}>
              {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Login as Tenant Admin
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
