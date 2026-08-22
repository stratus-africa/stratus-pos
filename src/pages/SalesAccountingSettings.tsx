import { useMemo } from "react";
import { useFinancePostingRules } from "@/hooks/useFinancePostingRules";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

const RULES = [
  ["sale_revenue", "Sales Revenue", "credit"],
  ["sale_tax", "Sales Tax Payable", "credit"],
  ["sale_cash", "Cash", "debit"],
  ["sale_mpesa", "M-Pesa", "debit"],
  ["sale_card", "Card / Bank", "debit"],
  ["sale_bank", "Bank", "debit"],
  ["sale_credit", "Accounts Receivable", "debit"],
] as const;

export default function SalesAccountingSettings() {
  const rules = useFinancePostingRules("sale");
  const accounts = useChartOfAccounts();
  const rows = accounts.query?.data || [];
  const existing = useMemo(
    () => new Map((rules.data || []).map((r) => [r.source_code, r])),
    [rules.data],
  );

  const save = async (code: string, accountId: string) => {
    const def = RULES.find((r) => r[0] === code);
    if (!def || accountId === "none") return;

    await rules.saveRule.mutateAsync({
      source_type: "sale",
      source_code: code,
      debit_account_id: def[2] === "debit" ? accountId : null,
      credit_account_id: def[2] === "credit" ? accountId : null,
      description: def[1],
      is_active: true,
    });
    toast.success(`${def[1]} mapping saved`);
  };

  if (accounts.query?.isLoading || rules.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading accounting mappings…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Accounting Mappings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Completed Sales automatically post to the General Ledger. Configure the accounts below first.
          </AlertDescription>
        </Alert>

        {RULES.map(([code, label]) => {
          const current = existing.get(code);
          const currentId = current?.debit_account_id || current?.credit_account_id || "none";

          return (
            <div key={code} className="grid gap-2 md:grid-cols-[220px_1fr] md:items-center">
              <Label>{label}</Label>
              <Select value={currentId} onValueChange={(v) => void save(code, v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not configured</SelectItem>
                  {rows.map((account: any) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} — {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
