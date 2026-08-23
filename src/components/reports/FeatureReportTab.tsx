import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState, useEffect } from "react";

type Row = Record<string, any>;
const money = (v: any) =>
  `KES ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

interface Props {
  title: string;
  rows: Row[];
  loading?: boolean;
  onExport?: () => void;
  pageSizes?: number[];
  statusFilter?: boolean;
}

export default function FeatureReportTab({
  title,
  rows,
  loading,
  onExport,
  pageSizes = [24, 50, 100, 200],
  statusFilter = false,
}: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, status, pageSize, rows]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())) &&
          (!statusFilter || status === "all" || String(r.status || "").toLowerCase() === status),
      ),
    [rows, q, status, statusFilter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice((page - 1) * pageSize, page * pageSize);
  const columns = useMemo(() => {
    const keys: string[] = [];
    filtered.slice(0, 100).forEach((r) =>
      Object.keys(r || {}).forEach((k) => {
        if (
          !keys.includes(k) &&
          ![
            "id",
            "business_id",
            "created_at",
            "updated_at",
            "product_id",
            "location_id",
            "products",
            "locations",
            "_batches",
          ].includes(k)
        )
          keys.push(k);
      }),
    );
    return keys.slice(0, 8);
  }, [filtered]);
  const exportCsv = () => {
    if (!filtered.length) return;
    const esc = (v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [columns.map(esc).join(","), ...filtered.map((r) => columns.map((c) => esc(r[c])).join(","))].join(
      "\n",
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex-1" />
          {statusFilter && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Adjustment status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Input className="w-56" placeholder="Filter report..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onExport || exportCsv}>
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading report…</div>
        ) : !filtered.length ? (
          <div className="py-10 text-center text-muted-foreground">No records for this report.</div>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {columns.map((c) => (
                      <th key={c} className="text-left p-2 whitespace-nowrap">
                        {label(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.map((r, i) => (
                    <tr key={r.id || i} className="border-b last:border-0">
                      {columns.map((c) => (
                        <td key={c} className="p-2 whitespace-nowrap">
                          {typeof r[c] === "number" &&
                          /(amount|total|price|cost|value|revenue|expense|tax|payment)/i.test(c)
                            ? money(r[c])
                            : String(r[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t mt-3 pt-3 text-sm">
              <span className="text-muted-foreground">{filtered.length} records</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
