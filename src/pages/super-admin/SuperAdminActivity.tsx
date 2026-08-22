import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, ChevronLeft, ChevronRight, FileText, Search, User, ShieldCheck, Clock3 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type AuditRow = {
  id: string;
  business_id: string;
  action: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  user_name: string | null;
  user_email: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
};

type Tenant = { id: string; name: string };
const PAGE_SIZE = 25;

export default function SuperAdminActivity() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tenant, setTenant] = useState("all");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const tenantMap = useMemo(() => new Map(tenants.map((t) => [t.id, t.name])), [tenants]);
  const actionOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))).sort(), [rows]);

  const fetchAudit = async () => {
    setLoading(true);
    const [{ data: audit }, { data: biz }] = await Promise.all([
      supabase.from("audit_logs").select("id,business_id,action,description,entity_type,entity_id,user_name,user_email,metadata,ip_address,created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("businesses").select("id,name").order("name"),
    ]);
    setRows((audit || []) as AuditRow[]);
    setTenants((biz || []) as Tenant[]);
    setLoading(false);
  };

  useEffect(() => { fetchAudit(); }, []);
  useEffect(() => { setPage(1); }, [search, tenant, action]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tenant !== "all" && r.business_id !== tenant) return false;
      if (action !== "all" && r.action !== action) return false;
      if (!q) return true;
      return [r.action, r.description, r.entity_type, r.entity_id, r.user_name, r.user_email, tenantMap.get(r.business_id)]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [rows, search, tenant, action, tenantMap]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div>
            <div><h1 className="text-2xl font-bold tracking-tight">Audit Log</h1><p className="text-sm text-muted-foreground">Immutable platform activity across tenants and privileged actions.</p></div>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex"><Clock3 className="h-3.5 w-3.5" /> Newest events first</div>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-3 sm:p-4 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="h-10 pl-9" placeholder="Search action, tenant, user, entity…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Select value={tenant} onValueChange={setTenant}><SelectTrigger className="w-full lg:w-56"><SelectValue placeholder="All tenants" /></SelectTrigger><SelectContent><SelectItem value="all">All tenants</SelectItem>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          <Select value={action} onValueChange={setAction}><SelectTrigger className="w-full lg:w-48"><SelectValue placeholder="All actions" /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem>{actionOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20 pb-3"><CardTitle className="text-sm flex items-center justify-between"><span className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Activity</span><span className="rounded-full bg-background px-2.5 py-1 text-xs font-normal text-muted-foreground">{filtered.length.toLocaleString()} events</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/20 text-left"><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Action</th><th className="px-4 py-3 font-medium">Tenant</th><th className="px-4 py-3 font-medium">Actor</th><th className="px-4 py-3 font-medium">Entity</th><th className="px-4 py-3" /></tr></thead><tbody>
            {loading ? <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Loading audit events…</td></tr> : pageRows.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No audit events match your filters.</td></tr> : pageRows.map((r) => <tr key={r.id} className="border-b border-border/60 hover:bg-primary/[0.025] cursor-pointer transition-colors" onClick={() => setSelected(r)}><td className="px-4 py-3 whitespace-nowrap"><div>{format(new Date(r.created_at), "MMM d, yyyy HH:mm")}</div><div className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div></td><td className="px-4 py-3"><Badge variant="outline" className="rounded-md bg-background font-mono text-[10px] uppercase tracking-wide">{r.action}</Badge><div className="text-xs text-muted-foreground mt-1 max-w-xs truncate">{r.description || "—"}</div></td><td className="px-4 py-3 font-medium">{tenantMap.get(r.business_id) || "Unknown tenant"}</td><td className="px-4 py-3"><div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" />{r.user_name || r.user_email || "System"}</div></td><td className="px-4 py-3 text-xs text-muted-foreground">{r.entity_type || "—"}{r.entity_id ? <div className="font-mono truncate max-w-32">{r.entity_id}</div> : null}</td><td className="px-4 py-3 text-right">›</td></tr>)}
          </tbody></table></div>
          <div className="flex items-center justify-between p-3 border-t"><span className="text-xs text-muted-foreground">Page {page} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Audit Event</DialogTitle></DialogHeader>{selected && <div className="space-y-4 text-sm"><div className="grid grid-cols-2 gap-4"><Info label="Action" value={selected.action} /><Info label="Tenant" value={tenantMap.get(selected.business_id) || selected.business_id} /><Info label="Actor" value={selected.user_name || selected.user_email || "System"} /><Info label="Timestamp" value={format(new Date(selected.created_at), "PPpp")} /><Info label="Entity" value={selected.entity_type || "—"} /><Info label="IP address" value={selected.ip_address || "—"} /></div><div><div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Description</div><div className="rounded-lg border p-3">{selected.description || "No description recorded."}</div></div><div><div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Metadata</div><pre className="rounded-lg bg-muted p-3 text-xs overflow-auto max-h-72">{JSON.stringify(selected.metadata || {}, null, 2)}</pre></div></div>}</DialogContent></Dialog>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium mt-0.5 break-words">{value}</div></div>; }
