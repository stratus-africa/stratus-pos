import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Wallet, Building2, Landmark, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { OpeningBalanceDialog } from "@/components/accounting/OpeningBalanceDialog";
import { toast } from "sonner";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  description: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
}

interface BankAccountSummary {
  id: string;
  name: string;
  account_type: string;
  bank_name: string | null;
  account_number: string | null;
  balance: number;
}

export default function ChartOfAccounts() {
  const { business } = useBusiness();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [openingAcc, setOpeningAcc] = useState<Account | null>(null);
  const [openingDialogOpen, setOpeningDialogOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "expense", description: "", parent_id: "" });

  const fetchAccounts = async () => {
    if (!business) return;
    const [accRes, bankRes] = await Promise.all([
      supabase.from("chart_of_accounts").select("*").eq("business_id", business.id).order("code"),
      supabase.from("bank_accounts").select("id, name, account_type, bank_name, account_number, balance")
        .eq("business_id", business.id).eq("is_active", true).order("name"),
    ]);
    setAccounts((accRes.data as Account[]) || []);
    setBankAccounts((bankRes.data as BankAccountSummary[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, [business?.id]);

  const handleSave = async () => {
    if (!business || !form.code || !form.name) {
      toast.error("Code and name are required");
      return;
    }
    const payload = {
      business_id: business.id,
      code: form.code,
      name: form.name,
      type: form.type,
      description: form.description || null,
      parent_id: form.parent_id || null,
    };

    if (editing) {
      const { error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Account updated");
    } else {
      const { error } = await supabase.from("chart_of_accounts").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Account created");
    }
    setDialogOpen(false);
    setEditing(null);
    setForm({ code: "", name: "", type: "expense", description: "", parent_id: "" });
    fetchAccounts();
  };

  const handleDelete = async (acc: Account) => {
    // Block delete if any opening balance / transactions exist
    if (Math.abs(Number(acc.opening_balance) || 0) > 0.0001) {
      toast.error(`Cannot delete "${acc.name}": account has an opening balance. Clear it first.`);
      return;
    }
    const { count: lineCount, error: lineErr } = await supabase
      .from("journal_entry_lines")
      .select("id", { count: "exact", head: true })
      .eq("account_id", acc.id);
    if (lineErr) { toast.error(lineErr.message); return; }
    if ((lineCount ?? 0) > 0) {
      toast.error(`Cannot delete "${acc.name}": ${lineCount} journal line${lineCount === 1 ? "" : "s"} reference this account.`);
      return;
    }

    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", acc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Account deleted");
    fetchAccounts();
  };

  const openEdit = (acc: Account) => {
    setEditing(acc);
    setForm({ code: acc.code, name: acc.name, type: acc.type, description: acc.description || "", parent_id: acc.parent_id || "" });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name: "", type: "expense", description: "", parent_id: "" });
    setDialogOpen(true);
  };

  const filtered = accounts.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.code.toLowerCase().includes(search.toLowerCase())
  );

  const typeColor = (type: string) => {
    const map: Record<string, string> = { asset: "default", liability: "secondary", equity: "outline", revenue: "default", expense: "destructive" };
    return (map[type] || "default") as any;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your accounting structure and opening balances</p>
        </div>
        <div className="flex gap-2">
          <Link to="/journal-entries">
            <Button variant="outline"><BookOpen className="mr-2 h-4 w-4" /> Journal Entries</Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Account</Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Account" : "New Account"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Code</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. 1000" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cash in Hand" />
              </div>
              <div className="space-y-2">
                <Label>Parent Account (optional)</Label>
                <Select value={form.parent_id} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {accounts.filter((a) => a.id !== editing?.id).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
              </div>
              <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Create"} Account</Button>
            </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <OpeningBalanceDialog
        account={openingAcc}
        open={openingDialogOpen}
        onOpenChange={(o) => { setOpeningDialogOpen(o); if (!o) setOpeningAcc(null); }}
        onSaved={fetchAccounts}
      />

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Bank & Cash Accounts
              <Badge variant="outline" className="text-[10px]">Asset</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Managed in Banking. These accounts are part of your Chart of Accounts under Assets.
            </p>
          </div>
          <Link to="/banking">
            <Button variant="outline" size="sm"><Building2 className="h-4 w-4 mr-1" /> Manage in Banking</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No bank or cash accounts yet. Add one in Banking.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bank / Number</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{b.account_type.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[b.bank_name, b.account_number].filter(Boolean).join(" • ") || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">KES {Number(b.balance).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-10" placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No accounts found. Create your first account to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Opening Balance</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((acc, idx) => (
                  <TableRow key={acc.id} className={idx % 2 === 0 ? "" : "bg-muted/30"}>
                    <TableCell className="font-mono font-medium">{acc.code}</TableCell>
                    <TableCell className="font-medium">{acc.name}</TableCell>
                    <TableCell><Badge variant={typeColor(acc.type)} className="capitalize">{acc.type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(acc.opening_balance) !== 0 ? `KES ${Number(acc.opening_balance).toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{acc.description || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Set opening balance" onClick={() => { setOpeningAcc(acc); setOpeningDialogOpen(true); }}>
                        <Landmark className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(acc)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(acc)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
