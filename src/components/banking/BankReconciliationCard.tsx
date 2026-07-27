import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface ReconRow {
  bank_account_id: string;
  account_name: string;
  opening_balance: number;
  stored_balance: number;
  derived_balance: number;
  difference: number;
  transaction_count: number;
  is_mismatched: boolean;
  is_negative: boolean;
  allow_negative_balance: boolean;
}

interface AuditRow {
  id: string;
  bank_account_id: string;
  bank_transaction_id: string | null;
  sale_id: string | null;
  operation: string;
  amount: number;
  signed_amount: number;
  balance_before: number | null;
  balance_after: number | null;
  created_at: string;
}

const kes = (n: number | null) =>
  `KES ${Number(n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BankReconciliationCard() {
  const { business } = useBusiness();
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const client = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            order: (c: string, o?: { ascending?: boolean }) => Promise<{ data: unknown[] | null }> & {
              limit: (n: number) => Promise<{ data: unknown[] | null }>;
            };
          };
        };
      };
    };
    const [recRes, audRes] = await Promise.all([
      client.from("bank_balance_reconciliation").select("*").eq("business_id", business.id).order("account_name"),
      client.from("bank_balance_audit").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(100),
    ]);
    const recRows = (recRes.data as ReconRow[]) || [];
    setRows(recRows);
    setAudit((audRes.data as AuditRow[]) || []);
    setAccountNames(Object.fromEntries(recRows.map((r) => [r.bank_account_id, r.account_name])));
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const mismatches = rows.filter((r) => r.is_mismatched);
  const negatives = rows.filter((r) => r.is_negative && !r.allow_negative_balance);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2">
          {mismatches.length || negatives.length ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          )}
          Balance Reconciliation
        </CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="reconciliation">
          <TabsList className="mb-3">
            <TabsTrigger value="reconciliation">Accounts</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="reconciliation">
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              {mismatches.length === 0 ? (
                <Badge variant="outline" className="text-emerald-700 border-emerald-300">All balances reconciled</Badge>
              ) : (
                <Badge variant="destructive">{mismatches.length} mismatched</Badge>
              )}
              {negatives.length > 0 && <Badge variant="destructive">{negatives.length} negative</Badge>}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Txns</TableHead>
                    <TableHead className="text-right">Stored</TableHead>
                    <TableHead className="text-right">Derived</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No accounts</TableCell></TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.bank_account_id} className={r.is_mismatched ? "bg-destructive/5" : undefined}>
                      <TableCell className="font-medium">
                        {r.account_name}
                        {r.is_negative && <Badge variant="destructive" className="ml-2 text-[10px]">negative</Badge>}
                      </TableCell>
                      <TableCell className="text-right">{kes(r.opening_balance)}</TableCell>
                      <TableCell className="text-right">{r.transaction_count}</TableCell>
                      <TableCell className="text-right">{kes(r.stored_balance)}</TableCell>
                      <TableCell className="text-right">{kes(r.derived_balance)}</TableCell>
                      <TableCell className={`text-right ${Number(r.difference) !== 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {kes(r.difference)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Sale</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Before → After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No recorded changes yet</TableCell></TableRow>
                  )}
                  {audit.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(a.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell>{accountNames[a.bank_account_id] || "—"}</TableCell>
                      <TableCell><Badge variant={a.operation === "DELETE" ? "destructive" : "secondary"}>{a.operation}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{a.sale_id ? a.sale_id.slice(0, 8) : "—"}</TableCell>
                      <TableCell className="text-right">{kes(a.signed_amount)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                        {kes(a.balance_before)} → {kes(a.balance_after)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
