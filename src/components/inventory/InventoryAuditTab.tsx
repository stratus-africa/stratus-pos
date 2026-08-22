import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, Search } from "lucide-react";

export function InventoryAuditTab() {
  const { business } = useBusiness();
  const { hasPermission } = usePermissions();
  const canView = hasPermission("inventory.view_movements") || hasPermission("inventory.view");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["inventory-audit", business?.id],
    queryFn: async () => {
      if (!business?.id) return [] as any[];
      const { data, error } = await supabase
        .from("inventory_audit_log" as any)
        .select("id,action,entity_type,entity_id,description,metadata,created_at,user_id")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!business?.id && canView,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return query.data ?? [];
    return (query.data ?? []).filter((row: any) =>
      [row.action, row.entity_type, row.description, row.entity_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [query.data, search]);

  if (!canView) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Inventory Audit Trail</CardTitle>
            <p className="text-sm text-muted-foreground">Immutable records of inventory mutations, approvals and batch changes.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search audit history..." className="pl-9" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Description</TableHead><TableHead>User</TableHead></TableRow></TableHeader>
          <TableBody>
            {query.isLoading ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading audit history…</TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No inventory audit events found.</TableCell></TableRow> : rows.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("en-KE")}</TableCell>
                <TableCell><Badge variant="secondary">{String(row.action || "event").replaceAll("_", " ")}</Badge></TableCell>
                <TableCell className="text-xs">{row.entity_type || "—"}<div className="font-mono text-[10px] text-muted-foreground">{row.entity_id ? String(row.entity_id).slice(0, 8) : ""}</div></TableCell>
                <TableCell className="max-w-[520px] text-sm">{row.description || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{row.user_id ? String(row.user_id).slice(0, 8) : "system"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
