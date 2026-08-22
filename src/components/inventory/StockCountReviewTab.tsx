import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ClipboardCheck, Check, X, Plus } from "lucide-react";

export function StockCountReviewTab() {
  const { business, currentLocation } = useBusiness();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const canCreate = hasPermission("inventory.count_create");
  const canPerform = hasPermission("inventory.count_perform");
  const canApprove = hasPermission("inventory.count_approve");
  const canViewVariance = hasPermission("inventory.view_variance");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const sessions = useQuery({
    queryKey: ["inventory-count-review", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business?.id) return [] as any[];
      let q = supabase.from("inventory_count_sessions" as any).select("id,location_id,status,notes,created_at,submitted_at,approved_at,created_by,locations(name),inventory_count_lines(id,product_id,expected_quantity,counted_quantity,variance,products(name,sku))").eq("business_id", business.id).order("created_at", { ascending: false });
      if (currentLocation?.id) q = q.eq("location_id", currentLocation.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!business?.id && (canCreate || canPerform || canApprove || canViewVariance),
  });

  const active = useMemo(() => (sessions.data ?? []).find((s: any) => s.id === sessionId) ?? (sessions.data ?? [])[0], [sessions.data, sessionId]);

  const createSession = async () => {
    if (!currentLocation?.id) return toast.error("Select a location first");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_inventory_count_session" as any, { _location_id: currentLocation.id, _notes: notes || null });
      if (error) throw error;
      setSessionId(data as string);
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["inventory-count-review"] });
      toast.success("Stock count session created");
    } catch (e: any) { toast.error(e?.message || "Could not create count session"); }
    finally { setBusy(false); }
  };

  const updateCount = async (lineId: string, value: string) => {
    const counted = Number(value);
    if (!Number.isFinite(counted) || counted < 0) return;
    const { error } = await supabase.rpc("record_inventory_count_line" as any, { _line_id: lineId, _counted_quantity: counted });
    if (error) toast.error(error.message); else await qc.invalidateQueries({ queryKey: ["inventory-count-review"] });
  };

  const submit = async () => {
    if (!active?.id) return;
    setBusy(true);
    try { const { error } = await supabase.rpc("submit_inventory_count_session" as any, { _session_id: active.id }); if (error) throw error; await qc.invalidateQueries({ queryKey: ["inventory-count-review"] }); toast.success("Count submitted for approval"); }
    catch (e: any) { toast.error(e?.message || "Could not submit count"); }
    finally { setBusy(false); }
  };

  const review = async (approve: boolean) => {
    if (!active?.id) return;
    setBusy(true);
    try { const { error } = await supabase.rpc((approve ? "approve_inventory_count_session" : "reject_inventory_count_session") as any, { _session_id: active.id, ...(approve ? {} : { _reason: "Rejected by approver" }) }); if (error) throw error; await qc.invalidateQueries({ queryKey: ["inventory-count-review"] }); await qc.invalidateQueries({ queryKey: ["inventory"] }); toast.success(approve ? "Count approved and inventory reconciled" : "Count rejected"); }
    catch (e: any) { toast.error(e?.message || "Could not review count"); }
    finally { setBusy(false); }
  };

  if (!(canCreate || canPerform || canApprove || canViewVariance)) return null;

  return <div className="space-y-4">
    <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Count Review & Variances</CardTitle><p className="text-sm text-muted-foreground">Physical count → variance → approval → inventory reconciliation.</p></div>{canCreate && <Button onClick={createSession} disabled={busy}><Plus className="mr-2 h-4 w-4" /> New Count</Button>}</div></CardHeader>
      <CardContent className="space-y-4">
        {canCreate && <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional count notes" />}
        {(sessions.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No count sessions found.</p> : <div className="space-y-2">{(sessions.data ?? []).map((s: any) => <Button key={s.id} variant={active?.id === s.id ? "default" : "outline"} size="sm" onClick={() => setSessionId(s.id)}>{new Date(s.created_at).toLocaleDateString("en-KE")} · {s.locations?.name || "Location"} · {s.status}</Button>)}</div>}
      </CardContent>
    </Card>

    {active && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">{active.locations?.name || "Stock Count"} <Badge variant="secondary" className="ml-2">{active.status}</Badge></CardTitle><div className="flex gap-2">{canPerform && active.status === "draft" && <Button size="sm" onClick={submit} disabled={busy}>Submit for Approval</Button>}{canApprove && active.status === "submitted" && <><Button size="sm" onClick={() => review(true)} disabled={busy}><Check className="mr-1 h-4 w-4" /> Approve</Button><Button size="sm" variant="outline" onClick={() => review(false)} disabled={busy}><X className="mr-1 h-4 w-4" /> Reject</Button></>}</div></div></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Expected</TableHead><TableHead className="text-right">Counted</TableHead><TableHead className="text-right">Variance</TableHead></TableRow></TableHeader><TableBody>{(active.inventory_count_lines ?? []).map((line: any) => <TableRow key={line.id}><TableCell>{line.products?.name || line.product_id}<div className="text-xs text-muted-foreground">{line.products?.sku || ""}</div></TableCell><TableCell className="text-right">{Number(line.expected_quantity || 0)}</TableCell><TableCell className="text-right">{active.status === "draft" && canPerform ? <Input className="ml-auto w-28 text-right" type="number" min="0" step="0.01" defaultValue={line.counted_quantity ?? ""} onBlur={(e) => updateCount(line.id, e.target.value)} /> : Number(line.counted_quantity ?? 0)}</TableCell><TableCell className={`text-right font-semibold ${Number(line.variance || 0) < 0 ? "text-destructive" : Number(line.variance || 0) > 0 ? "text-emerald-600" : ""}`}>{canViewVariance || canApprove ? Number(line.variance || 0) : "—"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
  </div>;
}
