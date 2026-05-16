import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Search, Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface AuditLog {
  id: string;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  metadata: any;
}

interface Props {
  logs: AuditLog[];
  loading: boolean;
  from: string;
  to: string;
}

const actionColor = (action: string) => {
  if (action.includes("delete") || action.includes("remove")) return "destructive";
  if (action.includes("create") || action.includes("add")) return "default";
  if (action.includes("update") || action.includes("edit")) return "secondary";
  return "outline";
};

export default function AuditLogReportTab({ logs, loading, from, to }: Props) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [previewLog, setPreviewLog] = useState<AuditLog | null>(null);

  const formatKES = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(Number(n || 0));

  const hasSnapshot = (l: AuditLog) => !!(l.metadata && l.metadata.snapshot);

  const printSnapshot = (l: AuditLog) => {
    const snap = l.metadata?.snapshot;
    if (!snap) return;
    const p = snap.purchase || {};
    const items = snap.items || [];
    const payments = snap.payments || [];
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return;
    const rows = items.map((it: any) => `
      <tr>
        <td>${it.products?.name || "—"}${it.products?.sku ? ` <span style="color:#888">(${it.products.sku})</span>` : ""}</td>
        <td style="text-align:right">${Number(it.quantity || 0)}</td>
        <td style="text-align:right">${formatKES(Number(it.unit_cost || 0))}</td>
        <td style="text-align:right">${formatKES(Number(it.total || 0))}</td>
      </tr>`).join("");
    const payRows = payments.map((pay: any) => `
      <tr>
        <td>${pay.date || ""}</td>
        <td>${pay.bank_accounts?.name || "—"}</td>
        <td>${pay.reference || ""}</td>
        <td style="text-align:right">${formatKES(Number(pay.amount || 0))}</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Deleted Purchase ${p.invoice_number || ""}</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,Arial;color:#1e293b;padding:24px;max-width:780px;margin:auto}
        h1{font-size:18px;margin:0 0 4px}
        h2{font-size:13px;margin:18px 0 6px;color:#475569;text-transform:uppercase;letter-spacing:.05em}
        .meta{font-size:12px;color:#64748b;margin-bottom:14px}
        .banner{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
        th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}
        th{background:#f8fafc;font-weight:600}
        .totals{margin-top:10px;text-align:right;font-size:13px}
        .totals div{margin:2px 0}
        .grand{font-weight:700;font-size:14px}
        @media print{ .noprint{display:none} }
      </style></head><body>
      <div class="noprint" style="text-align:right;margin-bottom:10px">
        <button onclick="window.print()" style="padding:6px 12px;background:#1e293b;color:white;border:0;border-radius:4px;cursor:pointer">Print</button>
      </div>
      <div class="banner"><strong>DELETED RECORD</strong> — Purchase deleted on ${format(new Date(l.created_at), "dd MMM yyyy HH:mm")} by ${l.user_name || l.user_email || "—"}</div>
      <h1>Purchase ${p.invoice_number || (p.id ? String(p.id).slice(0, 8) : "")}</h1>
      <div class="meta">
        Supplier: ${p.suppliers?.name || "—"} · Location: ${p.locations?.name || "—"}<br/>
        Status at deletion: <strong>${p.status || "—"}</strong> · Payment: ${p.payment_status || "—"}<br/>
        Created: ${p.created_at ? format(new Date(p.created_at), "dd MMM yyyy") : "—"}
      </div>
      <h2>Items (${items.length})</h2>
      <table><thead><tr><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#94a3b8">No items</td></tr>`}</tbody></table>
      <div class="totals">
        <div>Subtotal: ${formatKES(Number(p.subtotal || 0))}</div>
        <div>Tax: ${formatKES(Number(p.tax || 0))}</div>
        <div class="grand">Total: ${formatKES(Number(p.total || 0))}</div>
      </div>
      ${payments.length ? `<h2>Linked Payments (reversed)</h2>
      <table><thead><tr><th>Date</th><th>Account</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${payRows}</tbody></table>` : ""}
      ${p.notes ? `<h2>Notes</h2><div style="font-size:12px;white-space:pre-wrap">${p.notes}</div>` : ""}
      <div style="margin-top:24px;font-size:10px;color:#94a3b8">Audit ID: ${l.id}</div>
      </body></html>`);
    win.document.close();
  };

  const actions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action))).sort(),
    [logs]
  );
  const entities = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entity_type).filter(Boolean) as string[])).sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (entityFilter !== "all" && l.entity_type !== entityFilter) return false;
      if (!s) return true;
      return [l.user_name, l.user_email, l.action, l.entity_type, l.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    });
  }, [logs, search, actionFilter, entityFilter]);

  const buildRows = () =>
    filtered.map((l) => {
      const meta = l.metadata || {};
      const extra = [meta.invoice_number, meta.total ? `Total: ${meta.total}` : null]
        .filter(Boolean)
        .join(" • ");
      const desc = [l.description, extra].filter(Boolean).join(" — ");
      return [
        format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss"),
        l.user_name || "",
        l.user_email || "",
        l.action,
        l.entity_type || "",
        desc,
      ];
    });

  const exportCsv = () => {
    const headers = ["Date", "User", "Email", "Action", "Entity", "Description"];
    const rows = buildRows();
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Audit Trail Report", 14, 15);
    doc.setFontSize(9);
    doc.text(`Period: ${from} to ${to}`, 14, 21);
    doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, 14, 26);

    autoTable(doc, {
      startY: 30,
      head: [["Date", "User", "Action", "Entity", "Description"]],
      body: filtered.map((l) => {
        const meta = l.metadata || {};
        const extra = [meta.invoice_number, meta.total ? `Total: ${meta.total}` : null]
          .filter(Boolean)
          .join(" • ");
        const desc = [l.description, extra].filter(Boolean).join(" — ");
        return [
          format(new Date(l.created_at), "dd MMM yyyy HH:mm"),
          `${l.user_name || "—"}\n${l.user_email || ""}`,
          l.action.replace(/_/g, " "),
          l.entity_type || "—",
          desc || "—",
        ];
      }),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 4: { cellWidth: 100 } },
    });

    doc.save(`audit-log_${from}_to_${to}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search user, action..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a} className="capitalize">{a.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All entities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} entries</Badge>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={filtered.length === 0}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit entries match filters</TableCell></TableRow>
              ) : (
                filtered.map((l) => {
                  const meta = l.metadata || {};
                  const extra = [meta.invoice_number, meta.total ? `Total: ${meta.total}` : null].filter(Boolean).join(" • ");
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(l.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{l.user_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{l.user_email || ""}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionColor(l.action) as any} className="capitalize">{l.action.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.entity_type ? <span className="capitalize">{l.entity_type}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[400px]">
                        <div className="truncate" title={l.description || ""}>{l.description || "—"}</div>
                        {extra && <div className="text-xs text-muted-foreground/80 mt-0.5">{extra}</div>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
