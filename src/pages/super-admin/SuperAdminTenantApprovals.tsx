import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Info, Search, Loader2, Clock, Mail, Phone, Hash, FileText, StickyNote } from "lucide-react";

interface ApprovalRow {
  id: string;
  name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  kra_pin: string | null;
  business_reg_no: string | null;
  selected_package_id: string | null;
  package_name: string | null;
  approval_status: string;
  applied_at: string;
  expires_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  info_requested_at: string | null;
  info_request_message: string | null;
  email_verified_at: string | null;
  internal_notes: string | null;
  owner_id: string | null;
  owner_email: string | null;
}

const STATUSES = ["all", "pending", "info_requested", "approved", "rejected", "expired"] as const;

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    info_requested: "bg-blue-100 text-blue-800",
    expired: "bg-slate-200 text-slate-700",
  };
  return <Badge className={`${map[s] || "bg-muted"} border-0 font-medium capitalize`}>{s.replace("_", " ")}</Badge>;
};

export default function SuperAdminTenantApprovals() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ApprovalRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("list_tenant_approvals", {
      _status: status === "all" ? null : status,
      _search: search || null,
    });
    if (error) toast.error(error.message);
    setRows((data as ApprovalRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [status]);

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tenant Approvals</h1>
        <p className="text-muted-foreground text-sm">Review and manage new business registrations.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <CardTitle className="text-base">Registrations</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="Search name, contact, email…" className="pl-9 h-9 w-64" />
            </div>
            <Button variant="outline" size="sm" onClick={load}>Search</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList>
              {STATUSES.map(s => <TabsTrigger key={s} value={s} className="capitalize">{s.replace("_", " ")}</TabsTrigger>)}
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No registrations match this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="odd:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.contact_person || "—"}</TableCell>
                      <TableCell className="text-sm">{r.contact_email || "—"}</TableCell>
                      <TableCell className="text-sm">{r.contact_phone || "—"}</TableCell>
                      <TableCell className="text-sm">{r.package_name || "—"}</TableCell>
                      <TableCell className="text-sm">{format(new Date(r.applied_at), "dd MMM yyyy")}</TableCell>
                      <TableCell>{statusBadge(r.approval_status)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>Review</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <TenantDetailDialog
          row={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

function TenantDetailDialog({ row, onClose, onChanged }: { row: ApprovalRow; onClose: () => void; onChanged: () => void }) {
  const [mode, setMode] = useState<"view" | "reject" | "info" | "note">("view");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (rpc: string, args: any) => {
    setBusy(true);
    const { error } = await (supabase as any).rpc(rpc, args);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Done");
    onChanged();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {row.name}
            {statusBadge(row.approval_status)}
          </DialogTitle>
          <DialogDescription>Applied {format(new Date(row.applied_at), "dd MMM yyyy, HH:mm")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field icon={Mail} label="Email">{row.contact_email || "—"}</Field>
          <Field icon={Phone} label="Phone">{row.contact_phone || "—"}</Field>
          <Field icon={Hash} label="KRA PIN">{row.kra_pin || "—"}</Field>
          <Field icon={FileText} label="Business Reg. No.">{row.business_reg_no || "—"}</Field>
          <Field icon={CheckCircle2} label="Email verified">{row.email_verified_at ? format(new Date(row.email_verified_at), "dd MMM yyyy") : "Not yet"}</Field>
          <Field icon={Clock} label="Expires">{row.expires_at ? format(new Date(row.expires_at), "dd MMM yyyy") : "—"}</Field>
          <Field icon={FileText} label="Plan">{row.package_name || "—"}</Field>
          <Field icon={FileText} label="Contact person">{row.contact_person || "—"}</Field>
        </div>

        {row.approval_status === "rejected" && row.rejection_reason && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <strong>Rejection reason:</strong> {row.rejection_reason}
          </div>
        )}
        {row.approval_status === "info_requested" && row.info_request_message && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <strong>Info requested:</strong> {row.info_request_message}
          </div>
        )}

        {row.internal_notes && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 whitespace-pre-wrap">
            <div className="flex items-center gap-1 font-semibold mb-1"><StickyNote className="h-3 w-3" /> Internal notes</div>
            {row.internal_notes}
          </div>
        )}

        {mode !== "view" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {mode === "reject" && "Rejection reason (required)"}
              {mode === "info" && "Message to applicant"}
              {mode === "note" && "Internal note (super admin only)"}
            </label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {mode === "view" ? (
            <>
              <Button variant="outline" onClick={() => { setMode("note"); setText(""); }}>
                <StickyNote className="h-4 w-4 mr-1" /> Add note
              </Button>
              {["pending", "info_requested"].includes(row.approval_status) && (
                <>
                  <Button variant="outline" onClick={() => { setMode("info"); setText(""); }}>
                    <Info className="h-4 w-4 mr-1" /> Request info
                  </Button>
                  <Button variant="destructive" onClick={() => { setMode("reject"); setText(""); }}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button disabled={busy || !row.email_verified_at}
                    onClick={() => run("approve_tenant", { _business_id: row.id, _notes: null })}
                    className="bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setMode("view")}>Cancel</Button>
              <Button disabled={busy || !text.trim()} onClick={() => {
                if (mode === "reject") return run("reject_tenant", { _business_id: row.id, _reason: text.trim() });
                if (mode === "info") return run("request_tenant_info", { _business_id: row.id, _message: text.trim() });
                if (mode === "note") return run("add_tenant_internal_note", { _business_id: row.id, _note: text.trim() });
              }}>Submit</Button>
            </>
          )}
        </DialogFooter>

        {!row.email_verified_at && ["pending", "info_requested"].includes(row.approval_status) && (
          <p className="text-xs text-amber-700">Approve is disabled until the applicant verifies their email.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3 w-3" />{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
