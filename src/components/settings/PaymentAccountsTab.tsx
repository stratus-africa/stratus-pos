import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBusiness } from "@/contexts/BusinessContext";
import { useBankAccounts } from "@/hooks/useBankAccounts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Banknote, Smartphone, CreditCard, Save, Loader2, Info, Link2 } from "lucide-react";

const METHODS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "mpesa", label: "M-Pesa", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
];

export function PaymentAccountsTab() {
  const { business } = useBusiness();
  const { data: bankAccounts = [] } = useBankAccounts();
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!business) return;
    const load = async () => {
      const { data } = await supabase
        .from("payment_method_accounts" as any)
        .select("*")
        .eq("business_id", business.id);

      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((d) => {
          map[d.payment_method] = d.bank_account_id || "none";
        });
        setMappings(map);
      }
      setLoaded(true);
    };
    load();
  }, [business]);

  // Group methods by their assigned account → detect shared accounts
  const sharedGroups = useMemo(() => {
    const byAccount = new Map<string, string[]>();
    METHODS.forEach((m) => {
      const acc = mappings[m.key];
      if (!acc || acc === "none") return;
      const list = byAccount.get(acc) || [];
      list.push(m.key);
      byAccount.set(acc, list);
    });
    // Only return groups with >1 method
    return Array.from(byAccount.entries())
      .filter(([, methods]) => methods.length > 1)
      .map(([accountId, methods]) => ({
        accountId,
        accountName: bankAccounts.find((b) => b.id === accountId)?.name || "Unknown",
        methods,
      }));
  }, [mappings, bankAccounts]);

  const hasSharing = sharedGroups.length > 0;

  const performSave = async () => {
    if (!business) return;
    setSaving(true);
    try {
      for (const method of METHODS) {
        const accountId = mappings[method.key];
        if (!accountId || accountId === "none") {
          await (supabase.from("payment_method_accounts" as any) as any)
            .delete()
            .eq("business_id", business.id)
            .eq("payment_method", method.key);
        } else {
          const { error } = await (supabase.from("payment_method_accounts" as any) as any)
            .upsert({
              business_id: business.id,
              payment_method: method.key,
              bank_account_id: accountId,
            }, { onConflict: "business_id,payment_method" });
          if (error) throw error;
        }
      }
      toast.success("Payment account mappings saved");
    } catch (e: any) {
      toast.error("Failed to save: " + e.message);
    }
    setSaving(false);
    setConfirmOpen(false);
  };

  const handleSaveClick = () => {
    if (hasSharing) {
      setConfirmOpen(true);
    } else {
      performSave();
    }
  };

  if (!loaded) return null;

  const methodLabel = (k: string) => METHODS.find((m) => m.key === k)?.label || k;

  // For each row, identify the sibling methods sharing its account
  const siblingsFor = (methodKey: string): string[] => {
    const acc = mappings[methodKey];
    if (!acc || acc === "none") return [];
    return METHODS
      .map((m) => m.key)
      .filter((k) => k !== methodKey && mappings[k] === acc);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Payment Method Accounts</CardTitle>
          <CardDescription>
            Map each payment method to a bank or cash account. The same account can be selected for multiple payment methods — for example, Cash and M-Pesa can settle into one consolidated account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {METHODS.map((m) => {
            const siblings = siblingsFor(m.key);
            return (
              <div key={m.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <m.icon className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">{m.label}</Label>
                </div>
                <Select
                  value={mappings[m.key] || "none"}
                  onValueChange={(v) => setMappings((prev) => ({ ...prev, [m.key]: v }))}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not assigned —</SelectItem>
                    {bankAccounts.map((ba) => (
                      <SelectItem key={ba.id} value={ba.id}>
                        {ba.name} <span className="text-xs text-muted-foreground capitalize">({ba.account_type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {siblings.length > 0 && (
                  <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                    <Link2 className="h-3 w-3" />
                    Shared with {siblings.map(methodLabel).join(", ")}
                  </Badge>
                )}
              </div>
            );
          })}

          {/* Live shared-account summary */}
          {hasSharing && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm flex gap-2">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-blue-900">Shared account mapping detected</p>
                <ul className="text-blue-800/90 list-disc pl-5 space-y-0.5">
                  {sharedGroups.map((g) => (
                    <li key={g.accountId}>
                      <span className="font-semibold">{g.accountName}</span> receives:{" "}
                      {g.methods.map(methodLabel).join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button onClick={handleSaveClick} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Mappings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation when multiple methods share the same account */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-blue-600" />
              Confirm shared account mapping
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>The following accounts will receive funds from multiple payment methods:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {sharedGroups.map((g) => (
                    <li key={g.accountId}>
                      <span className="font-semibold text-foreground">{g.accountName}</span>{" "}
                      <span className="text-muted-foreground">←</span>{" "}
                      {g.methods.map(methodLabel).join(", ")}
                    </li>
                  ))}
                </ul>
                <p className="pt-1">
                  All listed methods will settle into the same consolidated account. Continue?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); performSave(); }} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, save mapping
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
