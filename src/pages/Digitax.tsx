import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDigitaxSettings, useDigitaxQueue, useDigitaxLogs, useRetryDigitaxItem } from "@/hooks/useDigitax";
import { RefreshCw, ShieldCheck, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  processing: "bg-blue-100 text-blue-700",
  submitted: "bg-emerald-100 text-emerald-700",
  retry_required: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-muted text-muted-foreground",
};

const DigitaxPage = () => {
  const { query: settingsQ } = useDigitaxSettings();
  const queueQ = useDigitaxQueue();
  const logsQ = useDigitaxLogs();
  const retry = useRetryDigitaxItem();

  const stats = useMemo(() => {
    const rows = queueQ.data ?? [];
    return {
      pending: rows.filter((r) => r.status === "pending" || r.status === "retry_required").length,
      submitted: rows.filter((r) => r.status === "submitted").length,
      failed: rows.filter((r) => r.status === "failed").length,
      total: rows.length,
    };
  }, [queueQ.data]);

  if (!settingsQ.data?.enabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Tax Compliance</h1>
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-lg font-medium">DigiTax is not enabled</p>
            <p className="text-sm text-muted-foreground">Enable it from Settings → Tax Compliance to start fiscalising invoices.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tax Compliance</h1>
        <Badge className="bg-emerald-100 text-emerald-700">DigiTax {settingsQ.data.environment}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<Clock className="h-4 w-4" />} label="Pending" value={stats.pending} tone="bg-amber-50 text-amber-700" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Submitted" value={stats.submitted} tone="bg-emerald-50 text-emerald-700" />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Failed" value={stats.failed} tone="bg-red-50 text-red-700" />
        <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Total submissions" value={stats.total} tone="bg-slate-50 text-slate-700" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
          <CardDescription>Queue of fiscal submissions to KRA. Failed items can be retried.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="queue">
            <TabsList>
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="logs">API logs</TabsTrigger>
            </TabsList>
            <TabsContent value="queue" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(queueQ.data ?? []).map((r) => (
                    <TableRow key={r.id as string}>
                      <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.created_at as string), "PP p")}</TableCell>
                      <TableCell className="capitalize">{String(r.invoice_type).replace("_", " ")}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLE[r.status as string] ?? ""}>{String(r.status).replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>{String(r.retry_count ?? 0)}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{r.error_message as string ?? "—"}</TableCell>
                      <TableCell>
                        {(r.status === "failed" || r.status === "retry_required") && (
                          <Button size="sm" variant="outline" onClick={() => retry.mutate(r.id as string)}>
                            <RefreshCw className="h-3 w-3 mr-1" /> Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!queueQ.data?.length && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No submissions yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="logs" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logsQ.data ?? []).map((r) => (
                    <TableRow key={r.id as string}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at as string), "PP p")}</TableCell>
                      <TableCell className="capitalize">{r.endpoint as string}</TableCell>
                      <TableCell>{String(r.http_status ?? "-")}</TableCell>
                      <TableCell>{r.execution_time_ms ? `${r.execution_time_ms} ms` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!logsQ.data?.length && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No logs yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${tone}`}>{icon}{label}</div>
        <p className="text-2xl font-bold mt-2">{value}</p>
      </CardContent>
    </Card>
  );
}

export default DigitaxPage;
