import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  User, Mail, Phone, Image as ImageIcon, Lock, Loader2, Building2,
  Receipt, Wallet, Landmark, TrendingUp, ArrowDownToLine,
} from "lucide-react";

interface DailyTotals {
  totalSales: number;
  txCount: number;
  byMethod: Record<string, number>;
}

interface AccountRecon {
  id: string;
  name: string;
  type: string;
  openingBalance: number;
  inflow: number;
  outflow: number;
  expected: number;
  currentBalance: number;
  variance: number;
}

const KES = (n: number) =>
  `KES ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { business, userRole, currentLocation } = useBusiness();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  // Daily records state
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [totals, setTotals] = useState<DailyTotals>({ totalSales: 0, txCount: 0, byMethod: {} });
  const [accountRecon, setAccountRecon] = useState<AccountRecon[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      setFullName(data?.full_name || "");
      setPhone(data?.phone || "");
      setAvatarUrl(data?.avatar_url || "");
      setLoading(false);
    })();
  }, [user]);

  // Load daily records
  useEffect(() => {
    if (!business) return;
    (async () => {
      setRecordsLoading(true);
      const start = `${date}T00:00:00.000Z`;
      const end = `${date}T23:59:59.999Z`;

      // 1) Sales for the day (this user's sales)
      const { data: salesRows } = await supabase
        .from("sales")
        .select("id, total")
        .eq("business_id", business.id)
        .eq("created_by", user!.id)
        .eq("status", "final")
        .gte("created_at", start)
        .lte("created_at", end);

      const saleIds = (salesRows || []).map((s) => s.id);
      const totalSales = (salesRows || []).reduce((sum, s) => sum + Number(s.total), 0);

      // 2) Payment breakdown by method
      const byMethod: Record<string, number> = {};
      if (saleIds.length) {
        const { data: pays } = await supabase
          .from("payments")
          .select("amount, method, sale_id")
          .in("sale_id", saleIds);
        (pays || []).forEach((p: { amount: number; method: string }) => {
          const k = (p.method || "other").toLowerCase();
          byMethod[k] = (byMethod[k] || 0) + Number(p.amount || 0);
        });
      }
      setTotals({ totalSales, txCount: saleIds.length, byMethod });

      // 3) Cash account reconciliations — show all bank/cash accounts
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("id, name, account_type, balance")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name", { ascending: true });

      const recon: AccountRecon[] = [];
      for (const acc of accounts || []) {
        const { data: txs } = await supabase
          .from("bank_transactions")
          .select("type, amount, date")
          .eq("bank_account_id", acc.id)
          .eq("date", date);

        let inflow = 0, outflow = 0;
        (txs || []).forEach((t: { type: string; amount: number }) => {
          const amt = Number(t.amount || 0);
          if (t.type === "payment_received" || t.type === "deposit" || t.type === "transfer_in") {
            inflow += amt;
          } else {
            outflow += amt;
          }
        });

        // Approx opening balance = current - today's net
        const currentBalance = Number(acc.balance || 0);
        const net = inflow - outflow;
        const openingBalance = currentBalance - net;
        const expected = openingBalance + inflow - outflow;
        recon.push({
          id: acc.id,
          name: acc.name,
          type: acc.account_type,
          openingBalance,
          inflow,
          outflow,
          expected,
          currentBalance,
          variance: currentBalance - expected,
        });
      }
      setAccountRecon(recon);
      setRecordsLoading(false);
    })();
  }, [business, user, date]);

  const methodList = useMemo(
    () => Object.entries(totals.byMethod).sort((a, b) => b[1] - a[1]),
    [totals]
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null, avatar_url: avatarUrl.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPwd(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setNewPassword("");
    setConfirmPassword("");
  };

  const initials = (fullName || user?.email || "U")
    .split(/[ @]/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join("");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account, password and view your daily records.</p>
      </div>

      {/* Identity card */}
      <Card>
        <CardContent className="pt-6 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
            <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold truncate">{fullName || user?.email}</h2>
              {userRole && <Badge variant="outline" className="capitalize">{userRole}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            {business && (
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {business.name}
                {currentLocation && <> · Location: <span className="font-medium">{currentLocation.name}</span></>}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Two-column on wide screens */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Profile form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account details</CardTitle>
            <CardDescription>Update your name, phone and avatar.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="full-name">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-10 h-10" placeholder="Jane Doe" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-10 h-10" placeholder="+254…" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" value={user?.email || ""} disabled className="pl-10 h-10" />
                </div>
                <p className="text-xs text-muted-foreground">Contact an admin to change your sign-in email.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avatar">Avatar URL</Label>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="pl-10 h-10" placeholder="https://…" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Change password</CardTitle>
            <CardDescription>Use a strong password with at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-pwd">New password</Label>
                  <Input id="new-pwd" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} placeholder="Min. 8 characters" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pwd">Confirm password</Label>
                  <Input id="confirm-pwd" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} placeholder="Repeat password" className="h-10" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={changingPwd || !newPassword}>
                  {changingPwd ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Daily Records */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Daily Records
            </CardTitle>
            <CardDescription>Total sales and cash account reconciliations for the selected day.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="record-date" className="text-xs text-muted-foreground">Date</Label>
            <Input
              id="record-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-[170px]"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sales summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Sales</p>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold mt-2">{KES(totals.totalSales)}</p>
              <p className="text-xs text-muted-foreground mt-1">{totals.txCount} transaction{totals.txCount === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Cash Collected</p>
                <Wallet className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold mt-2">{KES(totals.byMethod["cash"] || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">From your sales today</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">M-Pesa</p>
                <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold mt-2">{KES(totals.byMethod["mpesa"] || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">Mobile money</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Card / Other</p>
                <Landmark className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold mt-2">
                {KES((totals.byMethod["card"] || 0) + (totals.byMethod["bank"] || 0) + (totals.byMethod["other"] || 0))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Card, bank & other</p>
            </div>
          </div>

          {/* Method breakdown */}
          {methodList.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Payment Methods</h3>
              <div className="rounded-lg border divide-y">
                {methodList.map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="capitalize">{method}</span>
                    <span className="font-medium">{KES(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cash account reconciliation */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Cash Account Reconciliations</h3>
            {recordsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : accountRecon.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No accounts configured.</p>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">Inflow</TableHead>
                      <TableHead className="text-right">Outflow</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountRecon.map((r) => {
                      const ok = Math.abs(r.variance) < 0.01;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">{r.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{KES(r.openingBalance)}</TableCell>
                          <TableCell className="text-right text-emerald-600">+{KES(r.inflow)}</TableCell>
                          <TableCell className="text-right text-destructive">-{KES(r.outflow)}</TableCell>
                          <TableCell className="text-right font-medium">{KES(r.expected)}</TableCell>
                          <TableCell className="text-right font-medium">{KES(r.currentBalance)}</TableCell>
                          <TableCell className="text-right">
                            <span className={ok ? "text-emerald-600 font-medium" : "text-destructive font-semibold"}>
                              {KES(r.variance)}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Opening is derived from current balance minus today's net activity. Variance should be zero when all
              transactions are recorded against their accounts.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
