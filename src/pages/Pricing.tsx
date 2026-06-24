import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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

export default function Pricing() {
  const [packages, setPackages] = useState<PkgDisplay[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: pkgs } = await (supabase as any).rpc("get_public_subscription_packages");
      if (!pkgs || pkgs.length === 0) { setLoading(false); return; }
      const { data: feats } = await (supabase as any).rpc("get_public_package_features");
      const result: PkgDisplay[] = (pkgs as any[]).map(p => ({
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
          .filter(f => f.package_id === p.id)
          .map(f => f.feature_label),
      }));
      setPackages(result);
      setLoading(false);
    })();
  }, []);

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);

  const limitLabel = (n: number, singular: string, plural?: string) =>
    n < 0 ? `Unlimited ${plural || singular + "s"}` : `${n.toLocaleString()} ${n === 1 ? singular : (plural || singular + "s")}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 py-4 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-teal flex items-center justify-center">
              <Store className="h-4 w-4 text-teal-foreground" />
            </div>
            <span className="font-bold text-foreground">StratusPOS</span>
          </Link>
          <Link to="/sign-in"><Button variant="ghost" size="sm">Sign in</Button></Link>
        </div>
      </header>

      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">Pricing</span>
            <h1 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight mt-3 mb-4">Simple, scalable pricing.</h1>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">All plans include a free trial. No card required to start. Cancel anytime.</p>

            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === "monthly" ? "bg-teal text-teal-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >Monthly</button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === "yearly" ? "bg-teal text-teal-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >Yearly <span className="text-xs opacity-80">(save 20%)</span></button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground">Loading plans…</p>
          ) : packages.length === 0 ? (
            <p className="text-center text-muted-foreground">Pricing plans coming soon.</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {packages.map((pkg, i) => {
                const highlighted = i === 1;
                const price = billingCycle === "monthly" ? pkg.monthly_price_kes : pkg.yearly_price_kes;
                return (
                  <div
                    key={pkg.id}
                    className={`rounded-2xl border p-8 bg-card flex flex-col ${
                      highlighted ? "border-teal shadow-lg ring-1 ring-teal/30" : "border-border/60"
                    }`}
                  >
                    <h3 className="font-serif text-2xl text-foreground">{pkg.name}</h3>
                    {pkg.description && <p className="text-sm text-muted-foreground mt-1 mb-6">{pkg.description}</p>}
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-foreground">{formatKES(price)}</span>
                      <span className="text-muted-foreground">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
                    </div>
                    <ul className="space-y-3 mb-8 flex-1">
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                        <span>{limitLabel(pkg.max_locations, "location")}</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                        <span>{limitLabel(pkg.max_products, "product")}</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                        <span>{limitLabel(pkg.max_customers, "customer")}</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                        <span>{limitLabel(pkg.max_users, "team member")}</span>
                      </li>
                      {pkg.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                          <Check className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link to="/onboarding" className="w-full">
                      <Button className="w-full" variant={highlighted ? "default" : "outline"}>
                        Start free trial
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-10">
            Prices in Kenyan Shillings, exclusive of VAT where applicable. Payments processed securely by Paystack.
          </p>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 px-4 mt-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Stratus Business Systems</span>
          <div className="flex gap-6">
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/refund-policy" className="hover:text-foreground">Refunds</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
