import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSubscription } from "@/hooks/useSubscription";
import { usePaystackCheckout } from "@/hooks/usePaystackCheckout";
import { usePesapalCheckout } from "@/hooks/usePesapalCheckout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Crown, Loader2, ExternalLink, XCircle } from "lucide-react";

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
  const { openCheckout: openPesapalCheckout, loading: pesapalLoading } = usePesapalCheckout();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [packages, setPackages] = useState<PkgDisplay[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [usage, setUsage] = useState({ products: 0, customers: 0, suppliers: 0, users: 0 });
  const [pesapalEnabled, setPesapalEnabled] = useState(false);

  useEffect(() => {
    const fetchPkgs = async () => {
      const { data: pkgs } = await supabase
        .from("subscription_packages")
        .select("*")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order");

      if (!pkgs || pkgs.length === 0) {
        setLoadingPkgs(false);
        return;
      }

      const { data: feats } = await supabase.from("package_features").select("*").eq("enabled", true);

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
        features: (feats as any[] || [])
          .filter((f) => f.package_id === p.id)
          .map((f) => f.feature_label),
      }));
      setPackages(result);
      setLoadingPkgs(false);
    };
    fetchPkgs();
    // Load Pesapal availability so we can show its button
    (async () => {
      const { data } = await (supabase as any).rpc("is_payment_provider_enabled", { _provider: "pesapal" });
      setPesapalEnabled(!!data);
    })();
  }, []);

  // Fetch current usage counts for the business
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
      const { data, error } = await supabase.functions.invoke("paystack-manage-subscription", {
        body: {},
      });
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
      const { data, error } = await supabase.functions.invoke("paystack-manage-subscription", {
        body: { action: "cancel" },
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || "Could not cancel");
      toast.success("Subscription set to cancel at period end");
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    } finally {
      setCancelLoading(false);
    }
  };

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(amount);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Current Plan: {isActive ? currentPackage?.name || "Active" : "Free"}
          </CardTitle>
          <CardDescription>
            {isActive && subscription ? (
              isCanceling ? (
                <span className="text-orange-600">
                  Canceling — access until{" "}
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString()
                    : "—"}
                </span>
              ) : (
                <span>
                  Next billing:{" "}
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString()
                    : "—"}
                </span>
              )
            ) : (
              "You're on the free plan. Upgrade to unlock more features."
            )}
          </CardDescription>
        </CardHeader>
        {isActive && subscription && (
          <CardContent className="flex gap-2 flex-wrap">
            {subscription.paystack_subscription_code && (
              <Button variant="outline" onClick={handleManageBilling} disabled={portalLoading}>
                {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <ExternalLink className="mr-2 h-4 w-4" />
                Manage on Paystack
              </Button>
            )}
            {subscription.paystack_subscription_code && !isCanceling && (
              <Button variant="outline" onClick={handleCancel} disabled={cancelLoading}>
                {cancelLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Subscription
              </Button>
            )}
          </CardContent>
        )}
      </Card>

      <div className="flex justify-center gap-2">
        <Button
          variant={billingInterval === "monthly" ? "default" : "outline"}
          size="sm"
          onClick={() => setBillingInterval("monthly")}
        >
          Monthly
        </Button>
        <Button
          variant={billingInterval === "yearly" ? "default" : "outline"}
          size="sm"
          onClick={() => setBillingInterval("yearly")}
        >
          Yearly (save ~17%)
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No subscription plans available yet.
          </CardContent>
        </Card>
      ) : (
        <div
          className={`grid gap-4 ${
            packages.length >= 3
              ? "md:grid-cols-3"
              : packages.length === 2
              ? "md:grid-cols-2 max-w-3xl mx-auto"
              : "max-w-md mx-auto"
          }`}
        >
          {packages.map((pkg, i) => {
            const displayPrice =
              billingInterval === "yearly" ? pkg.yearly_price_kes : pkg.monthly_price_kes;
            const isPopular = i === 1 && packages.length >= 3;
            const noPrice = displayPrice <= 0;

            return (
              <Card key={pkg.id} className={`relative ${isPopular ? "border-primary ring-2 ring-primary/20" : ""}`}>
                {isPopular && <Badge className="absolute -top-2.5 left-4">Most Popular</Badge>}
                <CardHeader>
                  <CardTitle className="text-lg">{pkg.name}</CardTitle>
                  <div className="text-2xl font-bold">
                    {formatKES(displayPrice)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{billingInterval === "monthly" ? "mo" : "yr"}
                    </span>
                  </div>
                  {pkg.description && <CardDescription>{pkg.description}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    <LimitItem label="Locations" max={pkg.max_locations} />
                    <LimitItem label="Products" max={pkg.max_products} current={isCurrent(pkg.id) ? usage.products : undefined} />
                    <LimitItem label="Customers" max={pkg.max_customers} current={isCurrent(pkg.id) ? usage.customers : undefined} />
                    <LimitItem label="Suppliers" max={pkg.max_suppliers} current={isCurrent(pkg.id) ? usage.suppliers : undefined} />
                    <LimitItem label="Team members" max={pkg.max_users} current={isCurrent(pkg.id) ? usage.users : undefined} />
                    {pkg.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    disabled={checkoutLoading || noPrice}
                    onClick={() => handleSubscribe(pkg.id)}
                    title={noPrice ? "Price not yet configured" : undefined}
                  >
                    {checkoutLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {noPrice ? "Coming soon" : "Pay with Paystack"}
                  </Button>
                  {pesapalEnabled && !noPrice && (
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={pesapalLoading}
                      onClick={() =>
                        user && openPesapalCheckout({ packageId: pkg.id, interval: billingInterval })
                      }
                    >
                      {pesapalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Pay with Pesapal
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LimitItem({ label, max, current }: { label: string; max: number; current?: number }) {
  const isUnlimited = max < 0;
  const text = isUnlimited
    ? `Unlimited ${label.toLowerCase()}`
    : `${max.toLocaleString()} ${label.toLowerCase()}`;
  const usageText =
    current !== undefined
      ? isUnlimited
        ? ` (${current.toLocaleString()} used)`
        : ` (${current.toLocaleString()} / ${max.toLocaleString()} used)`
      : "";
  return (
    <li className="flex items-center gap-2 text-sm">
      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
      <span>
        {text}
        {usageText && <span className="text-muted-foreground">{usageText}</span>}
      </span>
    </li>
  );
}
