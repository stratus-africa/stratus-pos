import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Search, Plus, CreditCard } from "lucide-react";
import { useNavigate, useLocation } from "@/lib/router-compat";
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

const SUB_BADGES: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; className: string; label: string }
> = {
  active: { variant: "default", className: "bg-emerald-500/10 text-emerald-600 border-emerald-200", label: "Active" },
  trialing: { variant: "default", className: "bg-blue-500/10 text-blue-600 border-blue-200", label: "Trial" },
  past_due: { variant: "secondary", className: "bg-amber-500/10 text-amber-700 border-amber-200", label: "Past Due" },
  canceled: { variant: "secondary", className: "bg-muted text-muted-foreground", label: "Canceled" },
  none: { variant: "outline", className: "text-muted-foreground", label: "No Sub" },
};

export default function SuperAdminBusinesses() {
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [lastViewedId, setLastViewedId] = useState<string | null>(() => sessionStorage.getItem(LAST_TENANT_KEY));

  // Refresh highlight whenever we land back on the list
  useEffect(() => {
    setLastViewedId(sessionStorage.getItem(LAST_TENANT_KEY));
  }, [location.key]);

  const openTenant = (id: string) => {
    sessionStorage.setItem(LAST_TENANT_KEY, id);
    setLastViewedId(id);
    navigate(`/super-admin/businesses/${id}`);
  };

  const [showAdd, setShowAdd] = useState(false);
  const [deleteBiz, setDeleteBiz] = useState<BusinessRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    const [bizRes, salesRes, subsRes] = await Promise.all([
      supabase.from("businesses").select("*"),
      // Aggregated server-side: a plain sales select is capped at 1000 rows,
      // which made most tenants show KES 0 revenue.
      supabase.rpc("super_admin_business_sales_summary" as any),
      supabase.from("subscriptions").select("user_id, status, current_period_end, plan_code"),
    ]);
    if (!bizRes.data) {
      setLoading(false);
      return;
    }

    const salesByBiz = new Map<string, { count: number; revenue: number }>();
    ((salesRes.data as any[]) || []).forEach((s: any) => {
      salesByBiz.set(s.business_id, {
        count: Number(s.sales_count) || 0,
        revenue: Number(s.revenue) || 0,
      });
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
        let sub: SubInfo | null = biz.owner_id ? subsByUser.get(biz.owner_id) || null : null;
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
      }),
    );

    setBusinesses(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = businesses.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

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
                <TableHead>Subscription</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead className="text-center">Locations</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((biz) => {
                const sub = biz._subscription;
                const subKey = sub?.status && SUB_BADGES[sub.status] ? sub.status : sub ? "canceled" : "none";
                const subBadge = SUB_BADGES[subKey];
                return (
                  <TableRow
                    key={biz.id}
                    className={cn(
                      !biz.is_active && "opacity-60",
                      lastViewedId === biz.id && "bg-emerald-50/60 hover:bg-emerald-50",
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
                      {biz.is_active ? (
                        <Badge
                          variant="default"
                          className="bg-emerald-500/10 text-emerald-600 border-emerald-200 w-fit"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-destructive/10 text-destructive border-destructive/20 w-fit"
                        >
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
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

      <AddBusinessDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onCreated={() => {
          setLoading(true);
          fetchData();
        }}
      />
    </div>
  );
}
