import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, BookOpen, ChevronDown, ChevronRight, History } from "lucide-react";
import { useJournalEntries, JournalEntryLine } from "@/hooks/useJournalEntries";

interface JournalActivityRow {
  id: string;
  action: string;
  user_id: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
  userName?: string;
}
import { JournalEntryDialog } from "@/components/accounting/JournalEntryDialog";
import { Link } from "@/lib/router-compat";

export default function JournalEntries() {
  const { business } = useBusiness();
  const { hasPermission } = usePermissions();
  const { query, getLines, remove, submit, approve, reject, post, reverse } = useJournalEntries();

  const canCreate = hasPermission("manual_journals.create");
  const canDelete = hasPermission("manual_journals.delete");
  const canViewPosted = hasPermission("manual_journals.view_posted");
  const canSubmit = hasPermission("manual_journals.submit");
  const canApprove = hasPermission("manual_journals.approve");
  const canPost = hasPermission("manual_journals.post");
  const canReverse = hasPermission("manual_journals.reverse");
  const canExport = hasPermission("manual_journals.export");
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; type: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, JournalEntryLine[]>>({});
  const [activity, setActivity] = useState<Record<string, JournalActivityRow[]>>({});

  useEffect(() => {
    if (!business) return;
    supabase
      .from("chart_of_accounts")
      .select("id, code, name, type")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("code")
      .then(({ data }) => setAccounts(data || []));
  }, [business?.id]);

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    if (!lines[id]) {
      const data = await getLines(id);
      setLines((prev) => ({ ...prev, [id]: data }));
    }
    if (!activity[id]) {
      const { data: rows } = await (supabase.from as unknown as (t: string) => any)("accounting_audit_log")
        .select("id, action, user_id, created_at, details")
        .eq("journal_entry_id", id)
        .order("created_at", { ascending: false });
      const list = (rows || []) as JournalActivityRow[];
      const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
      let names: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("user_id", userIds);
        names = Object.fromEntries(
          (profs || []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name || "Unknown"]),
        );
      }
      setActivity((prev) => ({
        ...prev,
        [id]: list.map((r) => ({ ...r, userName: r.user_id ? names[r.user_id] || "Unknown user" : "System" })),
      }));
    }
    setExpanded(id);
  };

  const entries = (query.data || []).filter((e) => canViewPosted || !["posted", "reversed"].includes(e.status));
  const fmt = (n: number) => `KES ${Number(n).toLocaleString()}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Journal Entries
          </h1>
          <p className="text-sm text-muted-foreground">Post double-entry adjustments between accounts</p>
        </div>
        <div className="flex gap-2">
          <Link to="/chart-of-accounts">
            <Button variant="outline">Chart of Accounts</Button>
          </Link>
          {canExport && (
            <Button
              variant="outline"
              onClick={() => {
                const header = "Date,Reference,Description,Total,Status";
                const rows = entries.map((e) =>
                  [e.date, e.reference || "", e.description || "", e.total, e.status]
                    .map((v) => `"${String(v).replaceAll('"', '""')}"`)
                    .join(","),
                );
                const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "journal-entries.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} disabled={!canCreate || accounts.length < 2}>
            <Plus className="h-4 w-4 mr-1" /> New Entry
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Entries ({entries.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No journal entries yet. Create one to record adjustments, transfers, or accruals.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, idx) => (
                  <>
                    <TableRow key={e.id} className={idx % 2 === 0 ? "" : "bg-muted/30"}>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => toggleExpand(e.id)}>
                          {expanded === e.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{new Date(e.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-sm">{e.reference || "—"}</TableCell>
                      <TableCell className="text-sm">{e.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(e.total)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {e.status === "draft" && canSubmit && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={submit.isPending}
                              onClick={() => submit.mutate(e.id)}
                            >
                              Submit
                            </Button>
                          )}
                          {e.status === "submitted" && canApprove && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={approve.isPending}
                                onClick={() => approve.mutate(e.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={reject.isPending}
                                onClick={() => reject.mutate({ id: e.id })}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {e.status === "approved" && canPost && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={post.isPending}
                              onClick={() => post.mutate(e.id)}
                            >
                              Post
                            </Button>
                          )}
                          {e.status === "posted" && canReverse && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reverse.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Reverse this posted journal? A new reversing journal will be created.",
                                  )
                                )
                                  reverse.mutate(e.id);
                              }}
                            >
                              Reverse
                            </Button>
                          )}
                          {canDelete && e.status === "draft" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" disabled={remove.isPending}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete journal draft?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove the draft and its lines.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => remove.mutate(e.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded === e.id && (
                      <TableRow className="bg-muted/10">
                        <TableCell colSpan={7} className="p-0">
                          <div className="p-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Account</TableHead>
                                  <TableHead>Memo</TableHead>
                                  <TableHead className="text-right">Debit</TableHead>
                                  <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(lines[e.id] || []).map((l) => (
                                  <TableRow key={l.id}>
                                    <TableCell className="text-sm">
                                      <span className="font-mono text-xs text-muted-foreground mr-2">
                                        {l.chart_of_accounts?.code}
                                      </span>
                                      {l.chart_of_accounts?.name}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {l.description || "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {l.debit > 0 ? fmt(l.debit) : ""}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {l.credit > 0 ? fmt(l.credit) : ""}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>

                            <div className="mt-4 border-t pt-3">
                              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                <History className="h-4 w-4" /> Approval &amp; Posting Activity
                              </h4>
                              {(activity[e.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {(activity[e.id] || []).map((a) => {
                                    const d = (a.details || {}) as { previous_status?: string; new_status?: string };
                                    return (
                                      <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="text-muted-foreground font-mono">
                                          {new Date(a.created_at).toLocaleString()}
                                        </span>
                                        <Badge variant="outline" className="capitalize">
                                          {a.action.replaceAll("_", " ")}
                                        </Badge>
                                        {d.previous_status && d.new_status && (
                                          <span className="text-muted-foreground capitalize">
                                            {d.previous_status} → {d.new_status}
                                          </span>
                                        )}
                                        <span className="text-muted-foreground">by {a.userName}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <JournalEntryDialog open={dialogOpen} onOpenChange={setDialogOpen} accounts={accounts} />
    </div>
  );
}
