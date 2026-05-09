import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Building2, Wallet, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Landmark, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface BankAccount {
  id: string;
  name: string;
  account_number: string | null;
  bank_name: string | null;
  account_type: string;
  balance: number;
  is_active: boolean;
}

interface BankTransaction {
  id: string;
  bank_account_id: string;
  type: string;
  amount: number;
  date: string;
  reference: string | null;
  description: string | null;
  category: string | null;
  contact_name: string | null;
  sale_id: string | null;
  expense_id: string | null;
  created_at: string;
}

export default function Banking() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");

  // Account dialog
  const [accDialogOpen, setAccDialogOpen] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", account_number: "", bank_name: "", account_type: "bank", opening_balance: "" });

  // Transaction dialog
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [txnForm, setTxnForm] = useState({
    bank_account_id: "", type: "payment_received", amount: "", date: format(new Date(), "yyyy-MM-dd"),
    reference: "", description: "", category: "", contact_name: "",
  });

  // Transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_account_id: "", to_account_id: "", amount: "",
    date: format(new Date(), "yyyy-MM-dd"), reference: "", description: "",
  });
  const [transferLoading, setTransferLoading] = useState(false);

  // Pay Loan dialog
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    loan_account_id: "", from_account_id: "", amount: "",
    date: format(new Date(), "yyyy-MM-dd"), reference: "", description: "",
  });
  const [loanLoading, setLoanLoading] = useState(false);

  const fetchData = async () => {
    if (!business) return;
    const [accRes, txnRes] = await Promise.all([
      supabase.from("bank_accounts").select("*").eq("business_id", business.id).order("name"),
      supabase.from("bank_transactions").select("*").eq("business_id", business.id).order("date", { ascending: false }).limit(100),
    ]);
    setAccounts((accRes.data as BankAccount[]) || []);
    setTransactions((txnRes.data as BankTransaction[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [business?.id]);

  const handleCreateAccount = async () => {
    if (!business || !accForm.name) { toast.error("Account name is required"); return; }
    const opening = parseFloat(accForm.opening_balance) || 0;
    const { error } = await supabase.from("bank_accounts").insert({
      business_id: business.id, name: accForm.name, account_number: accForm.account_number || null,
      bank_name: accForm.bank_name || null, account_type: accForm.account_type,
      balance: opening,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Account created");
    setAccDialogOpen(false);
    setAccForm({ name: "", account_number: "", bank_name: "", account_type: "bank", opening_balance: "" });
    fetchData();
  };

  // Returns +1 for inflow, -1 for outflow on a non-loan account
  const balanceSign = (type: string) =>
    ["payment_received", "transfer_in", "owner_deposit", "loan_disbursement_received"].includes(type) ? 1 : -1;

  const handleCreateTransaction = async () => {
    if (!business || !user || !txnForm.bank_account_id || !txnForm.amount) {
      toast.error("Account and amount are required"); return;
    }
    const amount = parseFloat(txnForm.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    const { error } = await supabase.from("bank_transactions").insert({
      business_id: business.id, bank_account_id: txnForm.bank_account_id, type: txnForm.type,
      amount, date: txnForm.date, reference: txnForm.reference || null,
      description: txnForm.description || null, category: txnForm.category || null,
      contact_name: txnForm.contact_name || null, created_by: user.id,
    });
    if (error) { toast.error(error.message); return; }

    // Update account balance
    const acc = accounts.find((a) => a.id === txnForm.bank_account_id);
    if (acc) {
      const delta = balanceSign(txnForm.type) * amount;
      const newBalance = Number(acc.balance) + delta;
      await supabase.from("bank_accounts").update({ balance: newBalance }).eq("id", acc.id);
    }

    toast.success("Transaction recorded");
    setTxnDialogOpen(false);
    setTxnForm({ bank_account_id: "", type: "payment_received", amount: "", date: format(new Date(), "yyyy-MM-dd"), reference: "", description: "", category: "", contact_name: "" });
    fetchData();
  };

  const handlePayLoan = async () => {
    if (!business || !user) return;
    const { loan_account_id, from_account_id, amount: amtStr, date, reference, description } = loanForm;
    if (!loan_account_id || !from_account_id) { toast.error("Select loan and source accounts"); return; }
    const amount = parseFloat(amtStr);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    const fromAcc = accounts.find((a) => a.id === from_account_id);
    const loanAcc = accounts.find((a) => a.id === loan_account_id);
    if (!fromAcc || !loanAcc) { toast.error("Invalid accounts"); return; }
    if (loanAcc.account_type !== "loan") { toast.error("Selected account is not a loan account"); return; }
    if (Number(fromAcc.balance) < amount) {
      toast.error(`Insufficient balance in ${fromAcc.name} (KES ${Number(fromAcc.balance).toLocaleString()})`);
      return;
    }

    setLoanLoading(true);
    try {
      const ref = reference?.trim() || `LOAN-${Date.now()}`;
      const desc = description?.trim() || `Loan repayment to ${loanAcc.name}`;

      const { error: txnError } = await supabase.from("bank_transactions").insert([
        {
          business_id: business.id, bank_account_id: from_account_id, type: "loan_payment",
          amount, date, reference: ref, description: desc,
          category: "Loan Payment", contact_name: loanAcc.name, created_by: user.id,
        },
        {
          business_id: business.id, bank_account_id: loan_account_id, type: "loan_repayment_applied",
          amount, date, reference: ref, description: desc,
          category: "Loan Payment", contact_name: fromAcc.name, created_by: user.id,
        },
      ]);
      if (txnError) throw txnError;

      // Source account decreases, loan balance also decreases (paying down debt)
      await Promise.all([
        supabase.from("bank_accounts").update({ balance: Number(fromAcc.balance) - amount }).eq("id", fromAcc.id),
        supabase.from("bank_accounts").update({ balance: Number(loanAcc.balance) - amount }).eq("id", loanAcc.id),
      ]);

      toast.success(`Paid KES ${amount.toLocaleString()} towards ${loanAcc.name}`);
      setLoanDialogOpen(false);
      setLoanForm({ loan_account_id: "", from_account_id: "", amount: "", date: format(new Date(), "yyyy-MM-dd"), reference: "", description: "" });
      fetchData();
    } catch (err: any) {
      toast.error(`Loan payment failed: ${err.message}`);
    } finally {
      setLoanLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!business || !user) return;
    const { from_account_id, to_account_id, amount: amtStr, date, reference, description } = transferForm;

    if (!from_account_id || !to_account_id) { toast.error("Select both source and destination accounts"); return; }
    if (from_account_id === to_account_id) { toast.error("Source and destination must be different"); return; }

    const amount = parseFloat(amtStr);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    const fromAcc = accounts.find((a) => a.id === from_account_id);
    const toAcc = accounts.find((a) => a.id === to_account_id);
    if (!fromAcc || !toAcc) { toast.error("Invalid account selection"); return; }

    if (Number(fromAcc.balance) < amount) {
      toast.error(`Insufficient balance in ${fromAcc.name} (KES ${Number(fromAcc.balance).toLocaleString()})`);
      return;
    }

    setTransferLoading(true);
    try {
      const transferRef = reference?.trim() || `TRF-${Date.now()}`;
      const desc = description?.trim() || `Transfer from ${fromAcc.name} to ${toAcc.name}`;

      // Insert two linked transactions
      const { error: txnError } = await supabase.from("bank_transactions").insert([
        {
          business_id: business.id, bank_account_id: from_account_id, type: "transfer_out",
          amount, date, reference: transferRef, description: desc,
          category: "Transfer", contact_name: toAcc.name, created_by: user.id,
        },
        {
          business_id: business.id, bank_account_id: to_account_id, type: "transfer_in",
          amount, date, reference: transferRef, description: desc,
          category: "Transfer", contact_name: fromAcc.name, created_by: user.id,
        },
      ]);
      if (txnError) throw txnError;

      // Update both balances in parallel
      await Promise.all([
        supabase.from("bank_accounts").update({ balance: Number(fromAcc.balance) - amount }).eq("id", fromAcc.id),
        supabase.from("bank_accounts").update({ balance: Number(toAcc.balance) + amount }).eq("id", toAcc.id),
      ]);

      toast.success(`Transferred KES ${amount.toLocaleString()} from ${fromAcc.name} to ${toAcc.name}`);
      setTransferDialogOpen(false);
      setTransferForm({ from_account_id: "", to_account_id: "", amount: "", date: format(new Date(), "yyyy-MM-dd"), reference: "", description: "" });
      fetchData();
    } catch (err: any) {
      toast.error(`Transfer failed: ${err.message}`);
    } finally {
      setTransferLoading(false);
    }
  };

  const filteredTxns = selectedAccount === "all"
    ? transactions
    : transactions.filter((t) => t.bank_account_id === selectedAccount);

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name || "Unknown";

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banking</h1>
          <p className="text-sm text-muted-foreground">Track payments received and made across your accounts</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={accDialogOpen} onOpenChange={setAccDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Building2 className="mr-2 h-4 w-4" /> Add Account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Bank/Cash Account</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Account Name</Label>
                  <Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="e.g. KCB Main Account" />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select value={accForm.account_type} onValueChange={(v) => setAccForm({ ...accForm, account_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Account</SelectItem>
                      <SelectItem value="cash">Cash Account</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="loan">Loan Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input value={accForm.bank_name} onChange={(e) => setAccForm({ ...accForm, bank_name: e.target.value })} placeholder="e.g. KCB" />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input value={accForm.account_number} onChange={(e) => setAccForm({ ...accForm, account_number: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Opening Balance (KES)</Label>
                  <Input
                    type="number" step="0.01" value={accForm.opening_balance}
                    onChange={(e) => setAccForm({ ...accForm, opening_balance: e.target.value })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {accForm.account_type === "loan"
                      ? "For loans, enter the outstanding loan balance you owe."
                      : "Starting balance for this account."}
                  </p>
                </div>
                <Button onClick={handleCreateAccount} className="w-full">Create Account</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Record Transaction</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Transaction</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select value={txnForm.bank_account_id} onValueChange={(v) => setTxnForm({ ...txnForm, bank_account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={txnForm.type} onValueChange={(v) => setTxnForm({ ...txnForm, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payment_received">Payment Received</SelectItem>
                        <SelectItem value="payment_made">Payment Made</SelectItem>
                        <SelectItem value="withdrawal">Withdrawal</SelectItem>
                        <SelectItem value="owner_deposit">Owner Deposit / Capital</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input type="number" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={txnForm.date} onChange={(e) => setTxnForm({ ...txnForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input value={txnForm.reference} onChange={(e) => setTxnForm({ ...txnForm, reference: e.target.value })} placeholder="e.g. INV-001" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Name</Label>
                    <Input value={txnForm.contact_name} onChange={(e) => setTxnForm({ ...txnForm, contact_name: e.target.value })} placeholder="e.g. John" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input value={txnForm.category} onChange={(e) => setTxnForm({ ...txnForm, category: e.target.value })} placeholder="e.g. Sales" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} placeholder="Optional notes" />
                </div>
                <Button onClick={handleCreateTransaction} className="w-full">Record Transaction</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ArrowLeftRight className="mr-2 h-4 w-4" /> Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inter-Account Transfer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Account</Label>
                    <Select
                      value={transferForm.from_account_id}
                      onValueChange={(v) => setTransferForm({ ...transferForm, from_account_id: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id} disabled={a.id === transferForm.to_account_id}>
                            {a.name} (KES {Number(a.balance).toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To Account</Label>
                    <Select
                      value={transferForm.to_account_id}
                      onValueChange={(v) => setTransferForm({ ...transferForm, to_account_id: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id} disabled={a.id === transferForm.from_account_id}>
                            {a.name} (KES {Number(a.balance).toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={transferForm.amount}
                      onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={transferForm.date}
                      onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input
                    value={transferForm.reference}
                    onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })}
                    placeholder="Auto-generated if blank"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={transferForm.description}
                    onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>

                {transferForm.from_account_id && transferForm.to_account_id && parseFloat(transferForm.amount) > 0 && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <p className="font-medium">
                      Move <span className="font-bold">KES {parseFloat(transferForm.amount).toLocaleString()}</span> from{" "}
                      <span className="font-bold">{getAccountName(transferForm.from_account_id)}</span> to{" "}
                      <span className="font-bold">{getAccountName(transferForm.to_account_id)}</span>
                    </p>
                  </div>
                )}

                <Button onClick={handleTransfer} className="w-full" disabled={transferLoading}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  {transferLoading ? "Processing..." : "Confirm Transfer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {accounts.some((a) => a.account_type === "loan" && Number(a.balance) > 0) && (
          <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <CreditCard className="mr-2 h-4 w-4" /> Pay Loan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Pay Loan</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Loan Account</Label>
                    <Select value={loanForm.loan_account_id} onValueChange={(v) => setLoanForm({ ...loanForm, loan_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select loan" /></SelectTrigger>
                      <SelectContent>
                        {accounts.filter((a) => a.account_type === "loan").map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} (Balance: KES {Number(a.balance).toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pay From</Label>
                    <Select value={loanForm.from_account_id} onValueChange={(v) => setLoanForm({ ...loanForm, from_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Source account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.filter((a) => a.account_type !== "loan").map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} (KES {Number(a.balance).toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input type="number" min="0" step="0.01" value={loanForm.amount}
                      onChange={(e) => setLoanForm({ ...loanForm, amount: e.target.value })} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={loanForm.date}
                      onChange={(e) => setLoanForm({ ...loanForm, date: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={loanForm.reference}
                    onChange={(e) => setLoanForm({ ...loanForm, reference: e.target.value })}
                    placeholder="Auto-generated if blank" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={loanForm.description}
                    onChange={(e) => setLoanForm({ ...loanForm, description: e.target.value })}
                    placeholder="Optional notes" />
                </div>
                <Button onClick={handlePayLoan} className="w-full" disabled={loanLoading}>
                  <Landmark className="mr-2 h-4 w-4" />
                  {loanLoading ? "Processing..." : "Confirm Payment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* Account Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KES {totalBalance.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{accounts.length} accounts</p>
          </CardContent>
        </Card>
        {accounts.slice(0, 3).map((acc) => (
          <Card key={acc.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{acc.name}</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {Number(acc.balance).toLocaleString()}</div>
              <Badge variant="outline" className="text-xs capitalize mt-1">{acc.account_type.replace("_", " ")}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Transactions</CardTitle>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading...</p>
          ) : filteredTxns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No transactions yet. Record your first transaction to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount (KES)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTxns.map((txn) => {
                  const inflows = ["payment_received", "transfer_in", "owner_deposit", "loan_disbursement_received"];
                  const transfers = ["transfer_in", "transfer_out"];
                  const isIn = inflows.includes(txn.type);
                  const isTransfer = transfers.includes(txn.type);
                  const labelMap: Record<string, string> = {
                    payment_received: "Received",
                    payment_made: "Paid",
                    transfer_in: "Transfer In",
                    transfer_out: "Transfer Out",
                    withdrawal: "Withdrawal",
                    owner_deposit: "Owner Deposit",
                    loan_payment: "Loan Payment",
                    loan_repayment_applied: "Loan Reduced",
                    loan_disbursement_received: "Loan Received",
                  };
                  const label = labelMap[txn.type] || txn.type;
                  const variant = isTransfer ? "secondary" : (isIn ? "default" : "destructive");
                  return (
                    <TableRow key={txn.id}>
                      <TableCell>{format(new Date(txn.date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={variant} className="gap-1">
                          {isTransfer ? <ArrowLeftRight className="h-3 w-3" /> : (isIn ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />)}
                          {label}
                        </Badge>
                      </TableCell>
                      <TableCell>{getAccountName(txn.bank_account_id)}</TableCell>
                      <TableCell>{txn.contact_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{txn.description || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{txn.reference || "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${isIn ? "text-green-600" : "text-red-500"}`}>
                        {isIn ? "+" : "-"} {Number(txn.amount).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
