import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Check, Store, BarChart3, ShoppingCart, Package, Users, Shield,
  Smartphone, TrendingUp, ArrowRight, Globe, ChevronDown,
} from "lucide-react";

interface PkgDisplay {
  id: string;
  name: string;
  description: string | null;
  monthly_price_kes: number;
  yearly_price_kes: number;
  max_locations: number;
  max_products: number;
  max_users: number;
  features: string[];
}

const PLATFORM_FEATURES = [
  { icon: Shield, title: "Multi-Warehouse", description: "Manage stock across unlimited warehouses and transfer between locations with a few clicks." },
  { icon: ShoppingCart, title: "Point of Sale", description: "Built-in POS system with barcode scanning, receipts, and multiple payment methods." },
  { icon: Package, title: "Purchase & Sales", description: "Handle purchases, sales, returns, and quotations with full document lifecycle tracking." },
  { icon: BarChart3, title: "Real-Time Reports", description: "Dashboards and detailed reports for stock levels, profit, top products, and more." },
  { icon: Users, title: "Team & Permissions", description: "Invite your team and control access with granular role-based permissions." },
  { icon: Smartphone, title: "Mobile Ready", description: "Beautiful, responsive interface that works seamlessly on phone, tablet, and desktop." },
  { icon: TrendingUp, title: "Banking & Expenses", description: "Track every shilling — bank accounts, expenses, and payments to suppliers." },
  { icon: Store, title: "Tax Management", description: "Configure VAT rates, zero-rated, and exempt items aligned to KRA requirements." },
];

const STATS = [
  { value: "10K+", label: "Businesses" },
  { value: "50M+", label: "Items Managed" },
  { value: "99.9%", label: "Uptime" },
  { value: "4.8/5", label: "User Rating" },
];

const TESTIMONIALS = [
  { name: "Jane Wanjiru", role: "Owner, Bidii Mart", quote: "Switching to StratusPOS cut my closing time in half. The M-Pesa integration just works.", initial: "J" },
  { name: "Samuel Kiprono", role: "Manager, Highland Stores", quote: "We went from spreadsheets to real reports overnight. My accountant loves it.", initial: "S" },
  { name: "Aisha Mohammed", role: "CEO, Coast Retail Co.", quote: "Multi-location stock tracking finally makes sense. Highly recommended.", initial: "A" },
];

export default function Landing() {
  const [packages, setPackages] = useState<PkgDisplay[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    const fetch = async () => {
      const { data: pkgs } = await supabase
        .from("subscription_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (!pkgs || pkgs.length === 0) return;

      const { data: feats } = await supabase
        .from("package_features")
        .select("*")
        .eq("enabled", true);

      const result: PkgDisplay[] = (pkgs as any[]).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        monthly_price_kes: Number(p.monthly_price_kes ?? 0),
        yearly_price_kes: Number(p.yearly_price_kes ?? 0),
        max_locations: p.max_locations,
        max_products: p.max_products,
        max_users: p.max_users,
        features: (feats as any[] || [])
          .filter(f => f.package_id === p.id)
          .map(f => f.feature_label),
      }));
      setPackages(result);
    };
    fetch();
  }, []);

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-soft/40 via-background to-background text-foreground overflow-x-hidden">
      {/* Top navbar */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-teal flex items-center justify-center">
              <Store className="h-4 w-4 text-teal-foreground" />
            </div>
            <span className="text-base font-bold tracking-tight text-foreground">StratusPOS</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/sign-in" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3">Login</Link>
            <Button asChild className="rounded-full bg-teal hover:bg-teal-deep text-teal-foreground h-9 px-5 shadow-md shadow-teal/20">
              <Link to="/onboarding">Sign Up Free <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative pt-20 pb-32 px-4 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-20 -left-32 w-96 h-96 rounded-full bg-teal/10 blur-3xl" aria-hidden />
        <div className="absolute top-40 -right-32 w-96 h-96 rounded-full bg-teal-soft blur-3xl" aria-hidden />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-3 mb-8">
            <span className="h-px w-8 bg-rust" />
            <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">All-in-One Stock Management Platform</span>
          </div>

          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl text-foreground leading-[1.05] tracking-tight mb-8">
            Manage Your Inventory<br />Smarter
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Streamline your warehouse operations, track stock in real time, and grow your business with powerful POS, invoicing, and multi-location support.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="rounded-xl bg-rust hover:bg-rust/90 text-rust-foreground h-12 px-7 text-base shadow-lg shadow-rust/20">
              <Link to="/onboarding">Start Free Trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl bg-background border-border h-12 px-7 text-base">
              <a href="#features">Learn More</a>
            </Button>
          </div>
        </div>

        {/* Curved divider */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-background" aria-hidden />
      </section>

      {/* Stats */}
      <section className="px-4 -mt-12 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3">
              <span className="h-px w-8 bg-rust" />
              <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">By the Numbers</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map(s => (
              <div key={s.label} className="bg-card border border-border/70 rounded-2xl py-8 px-4 text-center shadow-sm hover:shadow-md transition-shadow">
                <div className="font-serif text-4xl font-medium text-foreground mb-1">{s.value}</div>
                <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-28 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-3 mb-4">
              <span className="h-px w-8 bg-rust" />
              <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">Features</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight">Everything You Need</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLATFORM_FEATURES.map(f => (
              <div
                key={f.title}
                className="group bg-card border border-border/60 rounded-2xl p-6 hover:border-teal hover:-translate-y-1 transition-all duration-300"
              >
                <div className="rounded-xl w-12 h-12 flex items-center justify-center mb-5 bg-teal-soft group-hover:bg-teal transition-colors">
                  <f.icon className="h-5 w-5 text-teal group-hover:text-teal-foreground transition-colors" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="py-28 px-4 bg-teal-soft/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-3 mb-4">
              <span className="h-px w-8 bg-rust" />
              <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">How It Works</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight">Three steps to launch.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "Create your workspace", desc: "Sign up in under 60 seconds — no credit card required." },
              { step: "02", title: "Add products & locations", desc: "Import your catalog or add products, units, and warehouses." },
              { step: "03", title: "Start selling", desc: "Open the POS and accept your first sale today." },
            ].map(s => (
              <div key={s.step} className="bg-card border border-border/70 rounded-2xl p-8 relative">
                <div className="absolute -top-4 left-8 bg-teal text-teal-foreground rounded-full px-3 py-1 text-xs font-bold tracking-wider">
                  STEP {s.step}
                </div>
                <h3 className="font-serif text-2xl text-foreground mb-3 mt-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-28 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-3 mb-4">
              <span className="h-px w-8 bg-rust" />
              <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">Testimonials</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight">Loved by retailers.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <figure key={t.name} className="bg-card border border-border/60 rounded-2xl p-7">
                <blockquote className="font-serif text-xl text-foreground leading-relaxed mb-6">
                  "{t.quote}"
                </blockquote>
                <figcaption className="flex items-center gap-3 pt-4 border-t border-border/60">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center font-semibold bg-teal text-teal-foreground">
                    {t.initial}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-28 px-4 bg-teal-soft/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 mb-4">
              <span className="h-px w-8 bg-rust" />
              <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">Pricing</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight mb-4">Simple, scalable pricing.</h2>
            <p className="text-muted-foreground mb-8">No hidden fees. Cancel anytime.</p>

            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === "monthly" ? "bg-teal text-teal-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === "yearly" ? "bg-teal text-teal-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Yearly <span className="text-xs opacity-80">(save 20%)</span>
              </button>
            </div>
          </div>

          {packages.length === 0 ? (
            <p className="text-center text-muted-foreground">Pricing plans coming soon.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {packages.map((pkg, i) => {
                const featured = i === 1;
                return (
                  <div
                    key={pkg.id}
                    className={`relative rounded-2xl p-8 bg-card transition-all ${
                      featured ? "border-2 border-teal shadow-xl lg:scale-105" : "border border-border/70 shadow-sm"
                    }`}
                  >
                    {featured && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rust text-rust-foreground px-3 py-1 rounded-full text-xs font-bold tracking-wider shadow">
                        MOST POPULAR
                      </div>
                    )}
                    <h3 className="font-serif text-2xl text-foreground">{pkg.name}</h3>
                    {pkg.description && <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>}
                    <div className="mt-6 mb-6">
                      <span className="font-serif text-5xl font-medium tracking-tight text-foreground">
                        {formatKES(billingCycle === "monthly" ? pkg.monthly_price_kes : pkg.yearly_price_kes)}
                      </span>
                      <span className="text-muted-foreground ml-1 text-sm">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
                    </div>
                    <Button
                      className={`w-full mb-6 h-11 rounded-xl ${
                        featured
                          ? "bg-rust hover:bg-rust/90 text-rust-foreground shadow-md"
                          : "bg-foreground hover:bg-foreground/90 text-background"
                      }`}
                      asChild
                    >
                      <Link to="/onboarding">Start Free Trial</Link>
                    </Button>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2.5 text-sm text-foreground/90">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                        <span>{pkg.max_locations} location{pkg.max_locations > 1 ? "s" : ""}</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-foreground/90">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                        <span>{pkg.max_products.toLocaleString()} products</span>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-foreground/90">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                        <span>{pkg.max_users} team member{pkg.max_users > 1 ? "s" : ""}</span>
                      </li>
                      {pkg.features.map(f => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
                          <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-28 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 mb-4">
              <span className="h-px w-8 bg-rust" />
              <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">FAQ</span>
            </div>
            <h2 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight">Common questions.</h2>
          </div>

          <div className="space-y-3">
            {[
              { q: "Is there a free trial?", a: "Yes — start with a 14-day free trial. No credit card required." },
              { q: "Does it support M-Pesa?", a: "Native M-Pesa STK Push integration is built in. Customers pay, your books update." },
              { q: "Can I manage multiple locations?", a: "Absolutely. Track stock, sales, and reports across unlimited warehouses and stores." },
              { q: "Is my data secure?", a: "Bank-grade encryption, daily backups, and tenant-isolated data — your business stays yours." },
              { q: "Can I cancel anytime?", a: "Yes. No lock-in contracts. Cancel from your dashboard whenever you like." },
            ].map(item => (
              <details key={item.q} className="group bg-card border border-border/70 rounded-xl px-5 py-4">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <span className="font-medium text-foreground">{item.q}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl p-12 sm:p-16 text-center bg-gradient-to-br from-teal to-teal-deep">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-teal-foreground/10 blur-3xl" aria-hidden />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-teal-foreground/10 blur-3xl" aria-hidden />
            <div className="relative">
              <h2 className="font-serif text-4xl sm:text-5xl text-teal-foreground mb-4 tracking-tight">
                Ready to get started?
              </h2>
              <p className="text-teal-foreground/80 text-lg mb-8 max-w-2xl mx-auto">
                Launch your workspace in under 60 seconds. Free to start.
              </p>
              <Button size="lg" asChild className="rounded-xl bg-rust hover:bg-rust/90 text-rust-foreground h-12 px-8 text-base shadow-lg">
                <Link to="/onboarding">Start Free Trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-teal flex items-center justify-center">
              <Store className="h-4 w-4 text-teal-foreground" />
            </div>
            <span className="font-bold text-foreground">StratusPOS</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/refund-policy" className="hover:text-foreground">Refunds</Link>
            <Link to="/sign-in" className="hover:text-foreground">Login</Link>
            <Link to="/super-admin/login" className="hover:text-foreground">Admin</Link>
            <span className="hidden sm:inline">© {new Date().getFullYear()} Stratus Business Systems</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
