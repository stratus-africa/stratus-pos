import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sunset, Loader2, Landmark, Wallet, AlertTriangle, ShieldCheck, ArrowRight, Info, MapPin } from "lucide-react";
import { useBankAccounts, BankAccount } from "@/hooks/useBankAccounts";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import type { POSSession } from "@/hooks/usePOSSession";

interface AccountReconciliation {
  accountId: string;
  accountName: string;
  accountType: string;
  expectedAmount: number;
  actualAmount: string;
}

interface EndDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: POSSession;
  onConfirm: (closingCash: number, notes?: string) => Promise<void>;
}

export default function EndDayDialog({ open, onOpenChange, session, onConfirm }: EndDayDialogProps) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingExpected, setLoadingExpected] = useState(false);
  const [reconciliations, setReconciliations] = useState<AccountReconciliation[]>([]);
  const [adminPin, setAdminPin] = useState("");
  const [adminApprovalStep, setAdminApprovalStep] = useState(false);
  const [verifyingAdmin, setVerifyingAdmin] = useState(false);
  const { data: bankAccounts = [] } = useBankAccounts();
  const { business, currentLocation, locations } = useBusiness();
  const multipleTills = locations.length > 1;

  // Calculate expected amounts per account from session payments
  useEffect(() => {
    if (!open || !business || !currentLocation || !session) return;

    const calculateExpected = async () => {
      setLoadingExpected(true);

      // Get all finalized sales during this session
      const { data: salesData } = await supabase
        .from("sales")
        .select("id")
        .eq("business_id", business.id)
        .eq("location_id", currentLocation.id)
        .gte("created_at", session.opened_at)
        .eq("status", "final");

      const saleIds = (salesData || []).map((s) => s.id);

      let paymentsByMethod: Record<string, number> = { cash: 0, mpesa: 0, card: 0, other: 0 };

      if (saleIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("method, amount")
          .in("sale_id", saleIds);

        (paymentsData || []).forEach((p) => {
          const amt = Number(p.amount);
          if (p.method === "cash" || p.method === "mpesa" || p.method === "card") {
            paymentsByMethod[p.method] += amt;
          } else {
            paymentsByMethod["other"] += amt;
          }
        });
      }

      // Get payment method -> account mappings
      const { data: mappings } = await supabase
        .from("payment_method_accounts")
        .select("payment_method, bank_account_id")
        .eq("business_id", business.id);

      const methodToAccount = new Map<string, string>();
      (mappings || []).forEach((m) => {
        if (m.bank_account_id) {
          methodToAccount.set(m.payment_method, m.bank_account_id);
        }
      });

      // Build reconciliation rows per account
      const accountExpected = new Map<string, number>();

      // Cash account: prefer the session's assigned cash account (set at Start of Day),
      // fall back to the business-level payment_method_accounts mapping.
      const cashAccountId =
        (session as POSSession & { cash_account_id?: string | null }).cash_account_id ||
        methodToAccount.get("cash");

      for (const [method, amount] of Object.entries(paymentsByMethod)) {
        if (amount === 0) continue;
        const accountId =
          method === "cash" ? cashAccountId : methodToAccount.get(method);
        if (accountId) {
          const current = accountExpected.get(accountId) || 0;
          accountExpected.set(accountId, current + amount);
        }
      }

      // Add opening float to cash account
      if (cashAccountId) {
        const current = accountExpected.get(cashAccountId) || 0;
        accountExpected.set(cashAccountId, current + Number(session.opening_float));
      }

      // Build reconciliation list
      const recons: AccountReconciliation[] = [];

      // If we have mapped accounts, show those
      if (accountExpected.size > 0) {
        for (const [accId, expected] of accountExpected) {
          const acc = bankAccounts.find((a) => a.id === accId);
          if (acc) {
            recons.push({
              accountId: accId,
              accountName: acc.name,
              accountType: acc.account_type,
              expectedAmount: expected,
              actualAmount: "",
            });
          }
        }
      }

      // Always show a "Cash in Register" row if no cash mapping exists
      if (!cashAccountId) {
        recons.unshift({
          accountId: "register-cash",
          accountName: "Cash in Register",
          accountType: "cash",
          expectedAmount: Number(session.opening_float) + paymentsByMethod.cash,
          actualAmount: "",
        });
      }

      // If no accounts mapped at all, show simple per-method breakdown
      if (recons.length === 0) {
        if (paymentsByMethod.cash > 0 || Number(session.opening_float) > 0) {
          recons.push({
            accountId: "cash",
            accountName: "Cash",
            accountType: "cash",
            expectedAmount: Number(session.opening_float) + paymentsByMethod.cash,
            actualAmount: "",
          });
        }
        if (paymentsByMethod.mpesa > 0) {
          recons.push({
            accountId: "mpesa",
            accountName: "M-Pesa",
            accountType: "mpesa",
            expectedAmount: paymentsByMethod.mpesa,
            actualAmount: "",
          });
        }
        if (paymentsByMethod.card > 0) {
          recons.push({
            accountId: "card",
            accountName: "Card",
            accountType: "card",
            expectedAmount: paymentsByMethod.card,
            actualAmount: "",
          });
        }
      }

      setReconciliations(recons);
      setLoadingExpected(false);
    };

    calculateExpected();
  }, [open, business, currentLocation, session, bankAccounts]);

  const totalVariance = useMemo(() => {
    return reconciliations.reduce((sum, r) => {
      const actual = parseFloat(r.actualAmount);
      if (isNaN(actual)) return sum;
      return sum + (actual - r.expectedAmount);
    }, 0);
  }, [reconciliations]);

  const hasVariance = useMemo(() => {
    return reconciliations.some((r) => {
      const actual = parseFloat(r.actualAmount);
      return !isNaN(actual) && actual !== r.expectedAmount;
    });
  }, [reconciliations]);

  const allFilled = useMemo(() => {
    return reconciliations.length > 0 && reconciliations.every((r) => {
      const v = parseFloat(r.actualAmount);
      return !isNaN(v) && v >= 0;
    });
  }, [reconciliations]);

  const updateActual = (accountId: string, value: string) => {
    setReconciliations((prev) =>
      prev.map((r) => (r.accountId === accountId ? { ...r, actualAmount: value } : r))
    );
  };

  const handleClose = async () => {
    // Total actual cash for the session close (sum of cash-type accounts)
    const totalActualCash = reconciliations
      .filter((r) => r.accountType === "cash")
      .reduce((sum, r) => sum + (parseFloat(r.actualAmount) || 0), 0);

    // Build variance notes
    const varianceLines = reconciliations
      .filter((r) => {
        const actual = parseFloat(r.actualAmount);
        return !isNaN(actual) && actual !== r.expectedAmount;
      })
      .map((r) => {
        const actual = parseFloat(r.actualAmount);
        const diff = actual - r.expectedAmount;
        return `${r.accountName}: Expected KES ${r.expectedAmount.toLocaleString()}, Actual KES ${actual.toLocaleString()}, Variance KES ${diff > 0 ? "+" : ""}${diff.toLocaleString()}`;
      });

    const fullNotes = [
      ...(varianceLines.length > 0 ? ["VARIANCES:", ...varianceLines] : []),
      ...(adminApprovalStep ? ["Admin approved variance closure."] : []),
      ...(notes.trim() ? [notes.trim()] : []),
    ].join("\n");

    setLoading(true);
    await onConfirm(totalActualCash, fullNotes || undefined);
    setLoading(false);
    resetState();
  };

  const handleProceed = () => {
    if (hasVariance) {
      setAdminApprovalStep(true);
    } else {
      handleClose();
    }
  };

  const handleAdminApproval = async () => {
    if (!adminPin.trim()) {
      toast.error("Enter admin email to approve.");
      return;
    }

    setVerifyingAdmin(true);

    // Check if the entered email belongs to an admin in this business
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", adminPin.trim().toLowerCase())
      .maybeSingle();

    if (!profile) {
      toast.error("User not found.");
      setVerifyingAdmin(false);
      return;
    }

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .eq("business_id", business?.id || "")
      .maybeSingle();

    if (!role || role.role !== "admin") {
      toast.error("This user is not an admin. Admin approval required.");
      setVerifyingAdmin(false);
      return;
    }

    setVerifyingAdmin(false);
    toast.success("Admin approved. Closing session...");
    await handleClose();
  };

  const resetState = () => {
    setNotes("");
    setAdminPin("");
    setAdminApprovalStep(false);
    setReconciliations([]);
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sunset className="h-5 w-5 text-orange-500" />
            End of Day Reconciliation
          </DialogTitle>
          <DialogDescription>
            Count cash and verify each account. Variances require admin approval.
          </DialogDescription>
        </DialogHeader>

        {!adminApprovalStep ? (
          <div className="space-y-4 py-2">
            {/* Session summary */}
            <div className="rounded-lg border p-3 bg-muted/50 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Till
                </span>
                <span className="font-medium">{currentLocation?.name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening Float</span>
                <span className="font-medium">KES {Number(session.opening_float).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Session Started</span>
                <span className="font-medium">{new Date(session.opened_at).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Cash reconciliation summary for selected till */}
            {(() => {
              const cashRow = reconciliations.find((r) => r.accountType === "cash");
              if (!cashRow) return null;
              const counted = parseFloat(cashRow.actualAmount);
              const hasCount = !isNaN(counted);
              const variance = hasCount ? counted - cashRow.expectedAmount : 0;
              return (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                    <Wallet className="h-4 w-4" />
                    Till Cash Reconciliation — {currentLocation?.name || "Till"}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected</div>
                      <div className="font-semibold">KES {cashRow.expectedAmount.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Counted</div>
                      <div className="font-semibold">
                        {hasCount ? `KES ${counted.toLocaleString()}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Variance</div>
                      <div
                        className={`font-semibold ${
                          !hasCount
                            ? "text-muted-foreground"
                            : variance === 0
                            ? "text-emerald-600"
                            : variance > 0
                            ? "text-blue-600"
                            : "text-destructive"
                        }`}
                      >
                        {hasCount ? `${variance > 0 ? "+" : ""}KES ${variance.toLocaleString()}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Multi-till settlement note */}
            {multipleTills && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs flex gap-2">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-blue-900">All tills settle to one cash account</p>
                  <p className="text-blue-800/80">
                    Cash counted at every till across this business is consolidated into the same
                    configured cash account. The single line below represents that consolidated
                    cash settlement.
                  </p>
                </div>
              </div>
            )}

            <Separator />

            {/* Per-account reconciliation */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                Account Reconciliation
              </Label>

              {loadingExpected ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {reconciliations.map((r) => {
                    const actual = parseFloat(r.actualAmount);
                    const variance = !isNaN(actual) ? actual - r.expectedAmount : null;

                    return (
                      <div key={r.accountId} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {r.accountType === "cash" ? (
                              <Wallet className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Landmark className="h-4 w-4 text-blue-500" />
                            )}
                            <span className="font-medium text-sm">{r.accountName}</span>
                          </div>
                          <Badge variant="outline" className="text-xs capitalize">{r.accountType}</Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground block">Expected</span>
                            <span className="font-semibold text-foreground">
                              KES {r.expectedAmount.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground block">Actual</span>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={r.actualAmount}
                              onChange={(e) => updateActual(r.accountId, e.target.value)}
                              placeholder="Count..."
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground block">Variance</span>
                            {variance !== null ? (
                              <span
                                className={`font-semibold text-sm ${
                                  variance === 0
                                    ? "text-emerald-600"
                                    : variance > 0
                                    ? "text-blue-600"
                                    : "text-destructive"
                                }`}
                              >
                                {variance > 0 ? "+" : ""}KES {variance.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Total variance */}
            {allFilled && (
              <div
                className={`rounded-lg border p-3 flex items-center justify-between ${
                  hasVariance
                    ? "bg-destructive/5 border-destructive/20"
                    : "bg-emerald-500/5 border-emerald-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {hasVariance ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  )}
                  <span className="text-sm font-medium">
                    {hasVariance ? "Variance Detected" : "All accounts balanced"}
                  </span>
                </div>
                <span
                  className={`font-bold text-sm ${
                    totalVariance === 0
                      ? "text-emerald-600"
                      : totalVariance > 0
                      ? "text-blue-600"
                      : "text-destructive"
                  }`}
                >
                  {totalVariance > 0 ? "+" : ""}KES {totalVariance.toLocaleString()}
                </span>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="closing-notes">Notes (optional)</Label>
              <Textarea
                id="closing-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about today's session..."
                rows={2}
              />
            </div>
          </div>
        ) : (
          /* Admin approval step */
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">Variance requires admin approval</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Total variance of{" "}
                <strong className={totalVariance >= 0 ? "text-blue-600" : "text-destructive"}>
                  {totalVariance > 0 ? "+" : ""}KES {totalVariance.toLocaleString()}
                </strong>{" "}
                detected. An admin must approve closing with this discrepancy.
              </p>

              {/* Show per-account variances */}
              <div className="mt-2 space-y-1 text-sm">
                {reconciliations
                  .filter((r) => {
                    const actual = parseFloat(r.actualAmount);
                    return !isNaN(actual) && actual !== r.expectedAmount;
                  })
                  .map((r) => {
                    const actual = parseFloat(r.actualAmount);
                    const diff = actual - r.expectedAmount;
                    return (
                      <div key={r.accountId} className="flex justify-between text-muted-foreground">
                        <span>{r.accountName}</span>
                        <span className={diff >= 0 ? "text-blue-600" : "text-destructive"}>
                          {diff > 0 ? "+" : ""}KES {diff.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                placeholder="Enter admin email to approve..."
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Enter the email of an admin user in this business to approve the closure.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {adminApprovalStep ? (
            <>
              <Button variant="outline" onClick={() => setAdminApprovalStep(false)}>
                Back
              </Button>
              <Button
                onClick={handleAdminApproval}
                disabled={verifyingAdmin || !adminPin.trim()}
                variant="destructive"
              >
                {verifyingAdmin ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Approve & Close
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleProceed}
                disabled={loading || !allFilled || loadingExpected}
                variant={hasVariance ? "destructive" : "default"}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : hasVariance ? (
                  <AlertTriangle className="mr-2 h-4 w-4" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                {hasVariance ? "Close with Variance" : "Close Register"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
