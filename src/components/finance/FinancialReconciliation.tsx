import { useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useFinanceReconciliation } from "@/hooks/useFinanceReconciliation";

type Props = {
  fromDate: string;
  toDate: string;
};

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

export default function FinancialReconciliation({ fromDate, toDate }: Props) {
  const { latestRun, items, run, resolve, reopen } =
    useFinanceReconciliation(fromDate, toDate);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const summary = useMemo(() => {
    const rows = items.data ?? [];
    return {
      passed: rows.filter((r) => r.status === "passed").length,
      exceptions: rows.filter((r) => r.status === "exception").length,
      resolved: rows.filter((r) => r.status === "resolved").length,
    };
  }, [items.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Financial Reconciliation</CardTitle>
            <p className="text-sm text-muted-foreground">
              Validate posted ledger integrity and bank-to-ledger balances.
            </p>
          </div>
          <Button
            onClick={() => run.mutate()}
            disabled={run.isPending || !fromDate || !toDate}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${run.isPending ? "animate-spin" : ""}`} />
            Run Reconciliation
          </Button>
        </CardHeader>

        <CardContent>
          {latestRun ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Checks</div>
                <div className="text-xl font-semibold">{latestRun.total_checks}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Passed</div>
                <div className="text-xl font-semibold">{summary.passed}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Exceptions</div>
                <div className="text-xl font-semibold">{summary.exceptions}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Resolved</div>
                <div className="text-xl font-semibold">{summary.resolved}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No reconciliation run has been performed for this business yet.
            </p>
          )}
        </CardContent>
      </Card>

      {items.data?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.data.map((item) => (
              <div key={item.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {item.entity_name || item.check_type}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.check_type}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.status === "passed" && (
                      <Badge variant="secondary">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Passed
                      </Badge>
                    )}
                    {item.status === "exception" && (
                      <Badge variant="destructive">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Exception
                      </Badge>
                    )}
                    {item.status === "resolved" && (
                      <Badge variant="secondary">
                        Resolved
                      </Badge>
                    )}
                    {item.status === "ignored" && (
                      <Badge variant="outline">
                        <XCircle className="mr-1 h-3 w-3" />
                        Ignored
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Expected</div>
                    <div>{money(item.expected_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Actual</div>
                    <div>{money(item.actual_amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Difference</div>
                    <div className={Number(item.difference) === 0 ? "" : "font-semibold text-destructive"}>
                      {money(item.difference)}
                    </div>
                  </div>
                </div>

                {item.status === "exception" && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Explain the difference or corrective action..."
                      value={notes[item.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        resolve.mutate({
                          itemId: item.id,
                          note: notes[item.id] ?? "",
                        })
                      }
                      disabled={resolve.isPending}
                    >
                      Mark Resolved
                    </Button>
                  </div>
                )}

                {(item.status === "resolved" || item.status === "ignored") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reopen.mutate(item.id)}
                    disabled={reopen.isPending}
                  >
                    Reopen
                  </Button>
                )}

                {item.resolution_note && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <span className="font-medium">Resolution:</span>{" "}
                    {item.resolution_note}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
