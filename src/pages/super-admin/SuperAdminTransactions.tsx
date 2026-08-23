import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  WalletCards,
} from "lucide-react";
import { Link } from "@/lib/router-compat";
import { paystackListTransactions, type PaystackTransactionRow } from "@/lib/paystack.functions";

const statusClass: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  abandoned: "bg-amber-50 text-amber-700 border-amber-200",
};

const formatKes = (amount: number, currency = "KES") =>
  `${currency} ${new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100)}`;

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default function SuperAdminTransactions() {
  const listTransactions = useServerFn(paystackListTransactions);
  const [rows, setRows] = useState<PaystackTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<"all" | "success" | "failed" | "abandoned">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [environment, setEnvironment] = useState("unknown");

  const load = async (nextPage = page) => {
    try {
      setRefreshing(true);
      const result = await listTransactions({ data: { page: nextPage, perPage: 50, status } });
      setRows(result.transactions);
      setTotal(result.total);
      setPages(result.pages);
      setEnvironment(result.environment);
      setPage(result.page);
    } catch (error: any) {
      toast.error(error?.message || "Unable to load Paystack transactions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(1);
  }, [status]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const customer = `${row.customer?.first_name || ""} ${row.customer?.last_name || ""} ${row.customer?.email || ""}`;
      return [row.reference, row.status, row.channel, row.gateway_response, customer]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search]);

  const counts = useMemo(
    () => ({
      success: rows.filter((r) => r.status === "success").length,
      failed: rows.filter((r) => r.status === "failed").length,
      other: rows.filter((r) => r.status !== "success" && r.status !== "failed").length,
      value: rows.filter((r) => r.status === "success").reduce((sum, r) => sum + Number(r.amount || 0), 0),
    }),
    [rows],
  );

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading transactions…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            to="/super-admin/payments"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Payments
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
              <p className="text-sm text-muted-foreground">Live transaction history from Paystack.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {environment} environment
          </Badge>
          <Button variant="outline" onClick={() => void load(page)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Transactions loaded</div>
          <div className="text-2xl font-bold mt-1">{total.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Successful on page</div>
          <div className="text-2xl font-bold mt-1">{counts.success}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Failed on page</div>
          <div className="text-2xl font-bold mt-1">{counts.failed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Successful value on page</div>
          <div className="text-2xl font-bold mt-1">{formatKes(counts.value)}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, customer or channel…"
                className="pl-9 w-full sm:w-80"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v: any) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Successful</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="abandoned">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr className="text-left">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid / Created</th>
                <th className="px-4 py-3 text-right">Paystack</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((row) => (
                <tr key={`${row.id}-${row.reference}`} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {`${row.customer?.first_name || ""} ${row.customer?.last_name || ""}`.trim() || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.customer?.email || "—"}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">{formatKes(Number(row.amount || 0), row.currency || "KES")}</td>
                  <td className="px-4 py-3 capitalize">{row.channel || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={statusClass[row.status] || ""}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(row.paid_at || row.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`https://dashboard.paystack.com/#/transactions/${row.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <WalletCards className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} transaction{filtered.length === 1 ? "" : "s"} on this page.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || refreshing} onClick={() => void load(page - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || refreshing}
              onClick={() => void load(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
