import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  Download,
  Landmark,
  Plus,
  RefreshCw,
  Search,
  Wallet,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BankAccount = {
  id: string;
  name: string;
  account_type: string;
  bank_name: string | null;
  account_number: string | null;
  balance: number | null;
  is_active: boolean;
};

type ManualTransaction = {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  transaction_type: "deposit" | "withdrawal" | "transfer" | "bank_charge";
  description: string;
  reference: string | null;
  amount: number;
  counterparty_account_id: string | null;
  reconciled: boolean;
  reconciled_at: string | null;
};

const EMPTY_ACCOUNT = {
  name: "",
  account_type: "bank",
  bank_name: "",
  account_number: "",
  balance: "0",
};

const EMPTY_TX = {
  bank_account_id: "",
  transaction_date: new Date().toISOString().slice(0, 10),
  transaction_type: "deposit",
  description: "",
  reference: "",
  amount: "",
  counterparty_account_id: "",
};

const formatKES = (value: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2,
  }).format(value);

export default function Banking() {
  const { business } = useBusiness();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();

  const canView = hasPermission("banking.view");
  const canCreateAccount = hasPermission("banking.create_account");
  const canEditAccount = hasPermission("banking.edit_account");
  const canDeleteAccount = hasPermission("banking.delete_account");
  const canViewTransactions = hasPermission("banking.view_transactions");
  const canDeposit = hasPermission("banking.deposit");
  const canWithdrawal = hasPermission("banking.withdrawal");
  const canTransfer = hasPermission("banking.transfer");
  const canCharge = hasPermission("banking.bank_charge");
  const canReconcile = hasPermission("banking.reconcile");
  const canExport = hasPermission("banking.export");

  const [accountDialog, setAccountDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT);
  const [transactionDialog, setTransactionDialog] = useState(false);
  const [txForm, setTxForm] = useState(EMPTY_TX);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["banking-accounts", business?.id],
    enabled: !!business?.id && canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,account_type,bank_name,account_number,balance,is_active")
        .eq("business_id", business!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });

  const transactionsQuery = useQuery({
    queryKey: ["banking-manual-transactions", business?.id],
    enabled: !!business?.id && canViewTransactions,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("banking_manual_transactions")
        .select("*")
        .eq("business_id", business!.id)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ManualTransaction[];
    },
  });

  const accounts = accountsQuery.data ?? [];
  const activeAccounts = accounts.filter((a) => a.is_active);
  const transactions = transactionsQuery.data ?? [];

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((t) =>
      [t.description, t.reference ?? "", t.transaction_type].join(" ").toLowerCase().includes(q),
    );
  }, [transactions, search]);

  const totalBalance = activeAccounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["banking-accounts"] });
    qc.invalidateQueries({ queryKey: ["banking-manual-transactions"] });
  };

  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountForm(EMPTY_ACCOUNT);
    setAccountDialog(true);
  };

  const openEditAccount = (account: BankAccount) => {
    setEditingAccount(account);
    setAccountForm({
      name: account.name,
      account_type: account.account_type,
      bank_name: account.bank_name ?? "",
      account_number: account.account_number ?? "",
      balance: String(account.balance ?? 0),
    });
    setAccountDialog(true);
  };

  const saveAccount = async () => {
    if (!business?.id || !accountForm.name.trim()) {
      toast.error("Account name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        business_id: business.id,
        name: accountForm.name.trim(),
        account_type: accountForm.account_type,
        bank_name: accountForm.bank_name.trim() || null,
        account_number: accountForm.account_number.trim() || null,
        balance: Number(accountForm.balance || 0),
        is_active: true,
      };

      if (editingAccount) {
        if (!canEditAccount) throw new Error("Permission denied: banking.edit_account");
        const { error } = await supabase
          .from("bank_accounts")
          .update(payload)
          .eq("id", editingAccount.id)
          .eq("business_id", business.id);
        if (error) throw error;
        toast.success("Bank account updated");
      } else {
        if (!canCreateAccount) throw new Error("Permission denied: banking.create_account");
        const { error } = await supabase.from("bank_accounts").insert(payload);
        if (error) throw error;
        toast.success("Bank account created");
      }

      setAccountDialog(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not save bank account");
    } finally {
      setBusy(false);
    }
  };

  const deactivateAccount = async (account: BankAccount) => {
    if (!business?.id || !canDeleteAccount) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_active: false })
        .eq("id", account.id)
        .eq("business_id", business.id);
      if (error) throw error;
      toast.success("Bank account deactivated");
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not deactivate account");
    } finally {
      setBusy(false);
    }
  };

  const allowedForType = (type: string) => {
    if (type === "deposit") return canDeposit;
    if (type === "withdrawal") return canWithdrawal;
    if (type === "transfer") return canTransfer;
    return canCharge;
  };

  const saveTransaction = async () => {
    if (!business?.id || !txForm.bank_account_id) {
      toast.error("Select a bank account");
      return;
    }
    if (!txForm.description.trim() || Number(txForm.amount) <= 0) {
      toast.error("Enter a description and positive amount");
      return;
    }
    if (!allowedForType(txForm.transaction_type)) {
      toast.error("You do not have permission for this transaction type");
      return;
    }

    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("record_banking_transaction", {
        _bank_account_id: txForm.bank_account_id,
        _transaction_date: txForm.transaction_date,
        _transaction_type: txForm.transaction_type,
        _description: txForm.description.trim(),
        _reference: txForm.reference.trim() || null,
        _amount: Number(txForm.amount),
        _counterparty_account_id: txForm.counterparty_account_id || null,
      });
      if (error) throw error;

      toast.success("Bank transaction recorded");
      setTransactionDialog(false);
      setTxForm(EMPTY_TX);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not record transaction");
    } finally {
      setBusy(false);
    }
  };

  const reconcileAccount = async (account: BankAccount) => {
    if (!canReconcile) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("reconcile_banking_account", {
        _bank_account_id: account.id,
      });
      if (error) throw error;
      toast.success(`${account.name} reconciled`);
      refresh();
    } catch (error: any) {
      toast.error(error?.message || "Could not reconcile account");
    } finally {
      setBusy(false);
    }
  };

  const exportTransactions = () => {
    if (!canExport) return;
    const rows = [
      ["Date", "Account", "Type", "Description", "Reference", "Amount", "Reconciled"],
      ...filteredTransactions.map((t) => [
        t.transaction_date,
        accountMap.get(t.bank_account_id)?.name ?? "",
        t.transaction_type,
        t.description,
        t.reference ?? "",
        String(t.amount),
        t.reconciled ? "Yes" : "No",
      ]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bank-transactions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!txForm.bank_account_id && activeAccounts[0]) {
      setTxForm((current) => ({
        ...current,
        bank_account_id: activeAccounts[0].id,
      }));
    }
  }, [activeAccounts]);

  if (!canView) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          You do not have permission to view Banking.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banking</h1>
          <p className="text-sm text-muted-foreground">
            Manage bank and cash accounts, transactions and reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <Button variant="outline" onClick={exportTransactions}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          )}
          {canCreateAccount && (
            <Button onClick={openNewAccount}>
              <Plus className="mr-2 h-4 w-4" /> Bank Account
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Accounts</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{activeAccounts.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cash / Bank Balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatKES(totalBalance)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unreconciled Transactions</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{transactions.filter((t) => !t.reconciled).length}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">
            <Wallet className="mr-2 h-4 w-4" /> Accounts
          </TabsTrigger>
          {canViewTransactions && (
            <TabsTrigger value="transactions">
              <Landmark className="mr-2 h-4 w-4" /> Transactions
            </TabsTrigger>
          )}
          {canReconcile && (
            <TabsTrigger value="reconciliation">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Reconciliation
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Bank & Cash Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Bank / Number</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No bank or cash accounts yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell className="capitalize">{account.account_type}</TableCell>
                        <TableCell>
                          {[account.bank_name, account.account_number].filter(Boolean).join(" • ") || "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatKES(Number(account.balance ?? 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={account.is_active ? "default" : "secondary"}>
                            {account.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Actions for ${account.name}`}
                                disabled={busy}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEditAccount && (
                                <DropdownMenuItem
                                  className="text-blue-600 focus:text-blue-600"
                                  onClick={() => openEditAccount(account)}
                                >
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                              )}
                              {canReconcile && account.is_active && (
                                <DropdownMenuItem
                                  className="text-indigo-600 focus:text-indigo-600"
                                  onClick={() => reconcileAccount(account)}
                                >
                                  <RefreshCw className="mr-2 h-4 w-4" /> Reconcile
                                </DropdownMenuItem>
                              )}
                              {canDeleteAccount && account.is_active && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => deactivateAccount(account)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Disable
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canViewTransactions && (
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Bank Transactions</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search transactions..."
                        className="pl-9 w-[260px]"
                      />
                    </div>
                    {(canDeposit || canWithdrawal || canTransfer || canCharge) && (
                      <Button onClick={() => setTransactionDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Transaction
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No banking transactions recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>{tx.transaction_date}</TableCell>
                          <TableCell>{accountMap.get(tx.bank_account_id)?.name ?? "—"}</TableCell>
                          <TableCell className="capitalize">{tx.transaction_type.replace("_", " ")}</TableCell>
                          <TableCell>{tx.description}</TableCell>
                          <TableCell>{tx.reference || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatKES(Number(tx.amount))}</TableCell>
                          <TableCell>
                            <Badge variant={tx.reconciled ? "default" : "secondary"}>
                              {tx.reconciled ? "Reconciled" : "Unreconciled"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canReconcile && (
          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <CardTitle>Account Reconciliation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeAccounts.map((account) => {
                  const accountTx = transactions.filter((t) => t.bank_account_id === account.id);
                  const unreconciled = accountTx.filter((t) => !t.reconciled).length;
                  return (
                    <div key={account.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <div className="font-medium">{account.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {unreconciled} unreconciled transaction{unreconciled === 1 ? "" : "s"} •{" "}
                          {formatKES(Number(account.balance ?? 0))}
                        </div>
                      </div>
                      <Button variant="outline" disabled={busy} onClick={() => reconcileAccount(account)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Reconcile
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Bank Account" : "New Bank Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder="Main Bank Account"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select
                value={accountForm.account_type}
                onValueChange={(v) => setAccountForm({ ...accountForm, account_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input
                  value={accountForm.bank_name}
                  onChange={(e) => setAccountForm({ ...accountForm, bank_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={accountForm.account_number}
                  onChange={(e) => setAccountForm({ ...accountForm, account_number: e.target.value })}
                />
              </div>
            </div>
            {!editingAccount && (
              <div className="space-y-2">
                <Label>Opening Balance</Label>
                <Input
                  type="number"
                  min="0"
                  value={accountForm.balance}
                  onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveAccount} disabled={busy}>
              {editingAccount ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transactionDialog} onOpenChange={setTransactionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Banking Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bank / Cash Account</Label>
              <Select
                value={txForm.bank_account_id}
                onValueChange={(v) => setTxForm({ ...txForm, bank_account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select
                value={txForm.transaction_type}
                onValueChange={(v: any) => setTxForm({ ...txForm, transaction_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canDeposit && <SelectItem value="deposit">Deposit</SelectItem>}
                  {canWithdrawal && <SelectItem value="withdrawal">Withdrawal</SelectItem>}
                  {canTransfer && <SelectItem value="transfer">Transfer</SelectItem>}
                  {canCharge && <SelectItem value="bank_charge">Bank Charge</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={txForm.transaction_date}
                  onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={txForm.amount}
                  onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={txForm.description}
                onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                placeholder="Cash deposit"
              />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} />
            </div>
            {txForm.transaction_type === "transfer" && (
              <div className="space-y-2">
                <Label>Destination Account</Label>
                <Select
                  value={txForm.counterparty_account_id}
                  onValueChange={(v) => setTxForm({ ...txForm, counterparty_account_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts
                      .filter((a) => a.id !== txForm.bank_account_id)
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveTransaction} disabled={busy}>
              Record Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
