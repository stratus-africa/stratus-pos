import { useMemo, useState } from "react";
import { useExpiringBatches, useUpdateBatch } from "@/hooks/useProductBatches";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Save } from "lucide-react";
import { toast } from "sonner";

export function ExpiryManagementTab() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission("inventory.view_expiry");
  const canManage = hasPermission("inventory.manage_expiry");
  const [days, setDays] = useState(60);
  const query = useExpiringBatches(days);
  const update = useUpdateBatch();
  const rows = query.data ?? [];
  const counts = useMemo(() => ({ expired: rows.filter((r: any) => r.expiry_date && new Date(r.expiry_date) < new Date()).length, soon: rows.filter((r: any) => r.expiry_date && new Date(r.expiry_date) >= new Date()).length }), [rows]);

  if (!canView) return <Card><CardContent className="py-8 text-sm text-muted-foreground">You do not have permission to view expiry information.</CardContent></Card>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Expiry Management</h3><p className="text-sm text-muted-foreground">Monitor expired and soon-to-expire inventory.</p></div><div className="flex items-center gap-2"><Input className="w-24" type="number" min="1" value={days} onChange={e => setDays(Math.max(1, Number(e.target.value) || 60))} /><span className="text-sm text-muted-foreground">days ahead</span></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expired</p><p className="text-2xl font-bold text-destructive">{counts.expired}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expiring within window</p><p className="text-2xl font-bold">{counts.soon}</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Expiry Queue</CardTitle></CardHeader><CardContent><div className="space-y-2">{rows.map((r: any) => { const expired = new Date(r.expiry_date) < new Date(); return <div key={r.id} className="flex items-center justify-between gap-3 border rounded-lg p-3"><div><div className="flex items-center gap-2"><span className="font-medium">{r.products?.name || "Product"}</span><Badge variant={expired ? "destructive" : "secondary"}>{expired ? "Expired" : "Expiring"}</Badge></div><p className="text-xs text-muted-foreground">Batch {r.batch_number} · Qty {r.quantity} · Expiry {r.expiry_date}</p></div>{canManage && <Button size="sm" variant="outline" onClick={async () => { const next = prompt("Enter new expiry date (YYYY-MM-DD)", r.expiry_date); if (!next || next === r.expiry_date) return; await update.mutateAsync({ id: r.id, expiry_date: next }); await query.refetch(); toast.success("Expiry date updated"); }}><Save className="mr-1 h-4 w-4" /> Update</Button>}</div>})}{rows.length === 0 && <p className="text-sm text-muted-foreground">No inventory expires within the selected window.</p>}</div></CardContent></Card>
  </div>;
}
