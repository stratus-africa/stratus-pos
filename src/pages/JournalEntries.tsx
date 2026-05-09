import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { useJournalEntries, JournalEntryLine } from "@/hooks/useJournalEntries";
import { JournalEntryDialog } from "@/components/accounting/JournalEntryDialog";
import { Link } from "react-router-dom";

export default function JournalEntries() {
  const { business } = useBusiness();
  const { query, getLines, remove } = useJournalEntries();
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; type: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, JournalEntryLine[]>>({});

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
    setExpanded(id);
  };

  const entries = query.data || [];
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
          <Button onClick={() => setDialogOpen(true)} disabled={accounts.length < 2}>
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
            <p className="p-6 text-sm text-muted-foreground">No journal entries yet. Create one to record adjustments, transfers, or accruals.</p>
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
                          {expanded === e.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>{new Date(e.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-sm">{e.reference || "—"}</TableCell>
                      <TableCell className="text-sm">{e.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(e.total)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{e.status}</Badge></TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete journal entry?</AlertDialogTitle>
                              <AlertDialogDescription>This will remove the entry and all its lines. This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(e.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
                                      <span className="font-mono text-xs text-muted-foreground mr-2">{l.chart_of_accounts?.code}</span>
                                      {l.chart_of_accounts?.name}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{l.description || "—"}</TableCell>
                                    <TableCell className="text-right font-mono">{l.debit > 0 ? fmt(l.debit) : ""}</TableCell>
                                    <TableCell className="text-right font-mono">{l.credit > 0 ? fmt(l.credit) : ""}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
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
