import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSubscription } from "@/hooks/useSubscription";
import { usePaystackCheckout } from "@/hooks/usePaystackCheckout";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Loader2, ExternalLink, XCircle, Banknote, Clock, ArrowUp, FileText, ArrowLeft } from "lucide-react";
import { OfflinePaymentDialog } from "./OfflinePaymentDialog";

interface PkgDisplay {
  id: string;
  name: string;
  description: string | null;
  monthly_price_kes: number;
  yearly_price_kes: number;
  max_locations: number;
  max_products: number;
  max_users: number;
  max_customers: number;
  max_suppliers: number;
  features: string[];
}

export function SubscriptionTab() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const { subscription, isActive, isCanceling, isLoading, currentPackage } = useSubscription();
  const { openCheckout, loading: checkoutLoading } = usePaystackCheckout();

  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [packages, setPackages] = useState<PkgDisplay[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [usage, setUsage] = useState({ products: 0, customers: 0, suppliers: 0, users: 0 });
  const [offlineTarget, setOfflineTarget] = useState<PkgDisplay | null>(null);
  const [pendingOffline, setPendingOffline] = useState<{ id: string; method: string; amount_kes: number; billing_interval: string; created_at: string } | null>(null);
  const [paystackEnabled, setPaystackEnabled] = useState<boolean>(false);
  const [offlineEnabled, setOfflineEnabled] = useState<boolean>(false);
  const [showPlans, setShowPlans] = useState(false);
  const [currentFeatures, setCurrentFeatures] = useState<string[]>([]);

  useEffect(() => {
    if (!currentPackage?.id) { setCurrentFeatures([]); return; }
    (async () => {
      const { data } = await (supabase as any).rpc("get_package_features_safe", { _package_id: currentPackage.id });
      setCurrentFeatures(((data as any[]) || []).map((f) => f.feature_label));
    })();
  }, [currentPackage?.id]);

  const fetchPending = async () => {
    if (!business?.id) return;
    const { data } = await supabase
      .from("offline_payment_requests")
      .select("id, method, amount_kes, billing_interval, created_at")
      .eq("business_id", business.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPendingOffline(data ?? null);
  };
  useEffect(() => { fetchPending(); }, [business?.id]);

  useEffect(() => {
    (async () => {
      const [{ data: ps }, { data: off }] = await Promise.all([
        (supabase as any).rpc("is_payment_provider_enabled", { _provider: "paystack" }),
        (supabase as any).rpc("get_offline_payment_settings"),
      ]);
      setPaystackEnabled(!!ps);
      const o = off as { enabled?: boolean; mpesa_enabled?: boolean; cash_enabled?: boolean } | null;
      setOfflineEnabled(!!o?.enabled && (!!o?.mpesa_enabled || !!o?.cash_enabled));
    })();
  }, []);

  useEffect(() => {
    const fetchPkgs = async () => {
      const { data: pkgs } = await (supabase as any).rpc("get_public_subscription_packages");
      if (!pkgs || pkgs.length === 0) { setLoadingPkgs(false); return; }
      const { data: feats } = await (supabase as any).rpc("get_public_package_features");
      const result: PkgDisplay[] = (pkgs as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        monthly_price_kes: Number(p.monthly_price_kes ?? 0),
        yearly_price_kes: Number(p.yearly_price_kes ?? 0),
        max_locations: p.max_locations,
        max_products: p.max_products,
        max_users: p.max_users,
        max_customers: p.max_customers ?? -1,
        max_suppliers: p.max_suppliers ?? -1,
        features: (feats as any[] || []).filter((f) => f.package_id === p.id).map((f) => f.feature_label),
      }));
      setPackages(result);
      setLoadingPkgs(false);
    };
    fetchPkgs();
  }, []);

  useEffect(() => {
    const fetchUsage = async () => {
      if (!business?.id) return;
      const [{ count: products }, { count: customers }, { count: suppliers }, { count: users }] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", business.id),
        supabase.from("suppliers" as any).select("id", { count: "exact", head: true }).eq("business_id", business.id),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("business_id", business.id),
      ]);
      setUsage({
        products: products ?? 0,
        customers: customers ?? 0,
        suppliers: suppliers ?? 0,
        users: users ?? 0,
      });
    };
    fetchUsage();
  }, [business?.id]);

  const handleSubscribe = (packageId: string) => {
    if (!user) return;
    openCheckout({ packageId, interval: billingInterval });
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-manage-subscription", { body: {} });
      if (error || !data?.url) throw new Error(error?.message || data?.error || "Could not open portal");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll keep access until the end of the current period.")) return;
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-manage-subscription", { body: { action: "cancel" } });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || "Could not cancel");
      toast.success("Subscription set to cancel at period end");
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    } finally {
      setCancelLoading(false);
    }
  };

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);

  const isCurrent = (pkgId: string) => currentPackage?.id === pkgId && isActive;

  if (isLoading || loadingPkgs) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // ------- Plan chooser view -------
  if (showPlans) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setShowPlans(false)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to overview
          </Button>
          <div className="flex gap-2">
            <Button variant={billingInterval === "monthly" ? "default" : "outline"} size="sm" onClick={() => setBillingInterval("monthly")}>Monthly</Button>
            <Button variant={billingInterval === "yearly" ? "default" : "outline"} size="sm" onClick={() => setBillingInterval("yearly")}>Yearly (save ~17%)</Button>
          </div>
        </div>

        {packages.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No subscription plans available yet.</CardContent></Card>
        ) : (
          <div className={`grid gap-4 ${packages.length >= 3 ? "md:grid-cols-3" : packages.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "max-w-md mx-auto"}`}>
            {packages.map((pkg, i) => {
              const displayPrice = billingInterval === "yearly" ? pkg.yearly_price_kes : pkg.monthly_price_kes;
              const isPopular = i === 1 && packages.length >= 3;
              const noPrice = displayPrice <= 0;
              return (
                <Card key={pkg.id} className={`relative ${isPopular ? "border-primary ring-2 ring-primary/20" : ""}`}>
                  {isPopular && <Badge className="absolute -top-2.5 left-4">Most Popular</Badge>}
                  {isCurrent(pkg.id) && <Badge variant="secondary" className="absolute -top-2.5 right-4">Current Plan</Badge>}
                  <CardHeader>
                    <CardTitle className="text-lg">{pkg.name}</CardTitle>
                    <div className="text-2xl font-bold">
                      {formatKES(displayPrice)}
                      <span className="text-sm font-normal text-muted-foreground">/{billingInterval === "monthly" ? "mo" : "yr"}</span>
                    </div>
                    {pkg.description && <CardDescription>{pkg.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      <LimitItem label="Locations" max={pkg.max_locations} />
                      <LimitItem label="Products" max={pkg.max_products} />
                      <LimitItem label="Customers" max={pkg.max_customers} />
                      <LimitItem label="Suppliers" max={pkg.max_suppliers} />
                      <LimitItem label="Team members" max={pkg.max_users} />
                      {pkg.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-500 shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-2">
                      {paystackEnabled && (
                        <Button className="w-full" variant={isPopular ? "default" : "outline"} disabled={checkoutLoading || noPrice} onClick={() => handleSubscribe(pkg.id)} title={noPrice ? "Price not yet configured" : undefined}>
                          {checkoutLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {noPrice ? "Coming soon" : "Pay with Paystack"}
                        </Button>
                      )}
                      {!noPrice && offlineEnabled && (
                        <Button className="w-full" variant={paystackEnabled ? "ghost" : (isPopular ? "default" : "outline")} size={paystackEnabled ? "sm" : "default"} onClick={() => setOfflineTarget(pkg)} disabled={!!pendingOffline}>
                          <Banknote className="mr-2 h-4 w-4" />Pay offline (M-Pesa / Cash)
                        </Button>
                      )}
                      {!paystackEnabled && !offlineEnabled && (
                        <p className="text-xs text-muted-foreground text-center">No payment methods available. Contact support.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {offlineTarget && (
          <OfflinePaymentDialog
            open={!!offlineTarget}
            onOpenChange={(o) => !o && setOfflineTarget(null)}
            packageId={offlineTarget.id}
            packageName={offlineTarget.name}
            billingInterval={billingInterval}
            amount={billingInterval === "yearly" ? offlineTarget.yearly_price_kes : offlineTarget.monthly_price_kes}
            onSubmitted={fetchPending}
          />
        )}
      </div>
    );
  }

  // ------- Overview view -------
  const startDate = subscription?.current_period_start ? new Date(subscription.current_period_start) : null;
  const endDate = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const daysRemaining = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const cycle = subscription?.plan_code && currentPackage?.paystack_plan_code_yearly === subscription.plan_code ? "Yearly" : "Monthly";
  const amount = cycle === "Yearly" ? currentPackage?.yearly_price_kes ?? 0 : currentPackage?.monthly_price_kes ?? 0;

  return (
    <div className="space-y-6">
      {pendingOffline && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4 flex items-start gap-3 text-sm">
            <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900">Offline payment pending approval</p>
              <p className="text-amber-800">
                {pendingOffline.method === "mpesa" ? "M-Pesa" : "Cash"} · KES {Number(pendingOffline.amount_kes).toLocaleString()} · {pendingOffline.billing_interval} · submitted {new Date(pendingOffline.created_at).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Current plan card */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xl">{isActive ? currentPackage?.name || "Active" : "Free"}</CardTitle>
            {isActive ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 rounded-full px-3">Active</Badge>
            ) : (
              <Badge variant="secondary" className="rounded-full px-3">Inactive</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div className="flex justify-between border-b pb-3">
                <span className="text-muted-foreground">Billing Cycle</span>
                <span className="font-medium">{isActive ? cycle : "—"}</span>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span className="text-muted-foreground">End Date</span>
                <span className="font-medium">{endDate ? endDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</span>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{isActive ? formatKES(amount) : "—"}</span>
              </div>
              <div className="flex justify-between border-b pb-3">
                <span className="text-muted-foreground">Days remaining</span>
                <span className="font-medium">{daysRemaining !== null ? `${daysRemaining} days` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start date</span>
                <span className="font-medium">{startDate ? startDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</span>
              </div>
              {isCanceling && (
                <div className="flex justify-between text-orange-600">
                  <span>Status</span><span className="font-medium">Canceling at period end</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => setShowPlans(true)}>
                <ArrowUp className="mr-2 h-4 w-4" />
                {isActive ? "Change Plan" : "Choose a Plan"}
              </Button>
              {isActive && subscription?.paystack_subscription_code && (
                <>
                  <Button variant="outline" onClick={handleManageBilling} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                    Billing & Invoices
                  </Button>
                  <Button variant="outline" onClick={handleManageBilling} disabled={portalLoading}>
                    <FileText className="mr-2 h-4 w-4" />Invoices
                  </Button>
                  {!isCanceling && (
                    <Button variant="outline" onClick={handleCancel} disabled={cancelLoading}>
                      {cancelLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                      Cancel Subscription
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Usage Limits</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <UsageRow label="Products" current={usage.products} max={currentPackage?.max_products ?? 0} />
              <UsageRow label="Users" current={usage.users} max={currentPackage?.max_users ?? 0} />
              <UsageRow label="Warehouses" current={0} max={currentPackage?.max_locations ?? 0} />
              <UsageRow label="Customers" current={usage.customers} max={(currentPackage as any)?.max_customers ?? -1} />
              <UsageRow label="Suppliers" current={usage.suppliers} max={(currentPackage as any)?.max_suppliers ?? -1} />
            </CardContent>
          </Card>

          {currentPackage && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Features</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {currentFeatures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No features listed for this plan.</p>
                ) : (
                  currentFeatures.map(f => (
                    <div key={f} className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-foreground">{f}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function UsageRow({ label, current, max }: { label: string; current: number; max: number }) {
  const isUnlimited = max <= 0;
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {current.toLocaleString()} / {isUnlimited ? "∞" : max.toLocaleString()}
      </span>
    </div>
  );
}

function LimitItem({ label, max }: { label: string; max: number }) {
  const isUnlimited = max < 0;
  const text = isUnlimited ? `Unlimited ${label.toLowerCase()}` : `${max.toLocaleString()} ${label.toLowerCase()}`;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
      <span>{text}</span>
    </li>
  );
}
