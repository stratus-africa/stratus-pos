import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Check,
  Store,
  BarChart3,
  ShoppingCart,
  Package,
  Users,
  Shield,
  Smartphone,
  TrendingUp,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { DEFAULT_CONTENT, loadAllSections, type SectionKey } from "@/lib/landing-cms";

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

const featureIcons = [Shield, ShoppingCart, Package, BarChart3, Users, Smartphone, TrendingUp, Store];
const statIcons = [Store, Package, Shield, TrendingUp];
const fallbackSections = Object.fromEntries(
  (Object.keys(DEFAULT_CONTENT) as SectionKey[]).map((key) => [key, { ...DEFAULT_CONTENT[key], is_visible: true }]),
) as Awaited<ReturnType<typeof loadAllSections>>;

export default function Landing() {
  const [packages, setPackages] = useState<PkgDisplay[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [sections, setSections] = useState(fallbackSections);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [cms, packageResult] = await Promise.all([
        loadAllSections().catch(() => fallbackSections),
        (async () => {
          const { data: pkgs } = await (supabase as any).rpc("get_public_subscription_packages");
          if (!pkgs?.length) return [] as PkgDisplay[];
          const { data: feats } = await (supabase as any).rpc("get_public_package_features");
          return (pkgs as any[]).map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            monthly_price_kes: Number(p.monthly_price_kes ?? 0),
            yearly_price_kes: Number(p.yearly_price_kes ?? 0),
            max_locations: p.max_locations,
            max_products: p.max_products,
            max_users: p.max_users,
            features: ((feats as any[]) || []).filter((f) => f.package_id === p.id).map((f) => f.feature_label),
          }));
        })(),
      ]);
      if (!cancelled) {
        setSections(cms);
        setPackages(packageResult);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);
  const visible = (key: SectionKey) => sections[key]?.is_visible !== false;

  const hero = sections.hero;
  const stats = sections.stats;
  const features = sections.features;
  const how = sections.how_it_works;
  const testimonials = sections.testimonials;
  const pricing = sections.pricing;
  const faq = sections.faq;
  const cta = sections.cta;

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-soft/40 via-background to-background text-foreground overflow-x-hidden">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-teal flex items-center justify-center">
              <Store className="h-4 w-4 text-teal-foreground" />
            </div>
            <span className="text-base font-bold tracking-tight">StratusPOS</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {visible("features") && (
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
                Features
              </a>
            )}
            {visible("pricing") && (
              <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
            )}
            {visible("how_it_works") && (
              <a href="#how" className="text-sm text-muted-foreground hover:text-foreground">
                How It Works
              </a>
            )}
            {visible("testimonials") && (
              <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground">
                Testimonials
              </a>
            )}
            {visible("faq") && (
              <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground">
                FAQ
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/sign-in" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3">
              Login
            </Link>
            <Button asChild className="rounded-full bg-teal hover:bg-teal-deep text-teal-foreground h-9 px-5 shadow-md">
              <Link to="/onboarding">
                Sign Up Free <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {visible("hero") && (
        <section className="relative pt-20 pb-32 px-4 overflow-hidden">
          <div className="absolute top-20 -left-32 w-96 h-96 rounded-full bg-teal/10 blur-3xl" />
          <div className="absolute top-40 -right-32 w-96 h-96 rounded-full bg-teal-soft blur-3xl" />
          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-3 mb-8">
              <span className="h-px w-8 bg-rust" />
              <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">{hero.subtitle}</span>
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-8">
              {hero.title}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              {hero.content.description}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                asChild
                size="lg"
                className="rounded-xl bg-rust hover:bg-rust/90 text-rust-foreground h-12 px-7 text-base shadow-lg"
              >
                <Link to={hero.content.primary_url || "/onboarding"}>
                  {hero.content.primary_text || "Start Free Trial"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {hero.content.secondary_text && (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-xl bg-background border-border h-12 px-7 text-base"
                >
                  <a href={hero.content.secondary_url || "#features"}>{hero.content.secondary_text}</a>
                </Button>
              )}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-background" />
        </section>
      )}

      {visible("stats") && (
        <section className="px-4 -mt-12 relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-3">
                <span className="h-px w-8 bg-rust" />
                <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">{stats.title}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(stats.content.items || [])
                .filter((s: any) => s.active !== false)
                .map((s: any, i: number) => {
                  const Icon = statIcons[i % statIcons.length];
                  return (
                    <div
                      key={`${s.label}-${i}`}
                      className="bg-card border border-border/70 rounded-2xl py-8 px-4 text-center shadow-xs hover:shadow-md transition-shadow"
                    >
                      <Icon className="h-5 w-5 mx-auto mb-3 text-teal" />
                      <div className="font-serif text-4xl font-medium mb-1">{s.value}</div>
                      <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                        {s.label}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      {visible("features") && (
        <section id="features" className="py-28 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-3 mb-4">
                <span className="h-px w-8 bg-rust" />
                <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">Features</span>
              </div>
              <h2 className="font-serif text-4xl sm:text-5xl tracking-tight">{features.title}</h2>
              <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">{features.subtitle}</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {(features.content.items || [])
                .filter((f: any) => f.active !== false)
                .map((f: any, i: number) => {
                  const Icon = featureIcons[i % featureIcons.length];
                  return (
                    <div
                      key={`${f.title}-${i}`}
                      className="group bg-card border border-border/60 rounded-2xl p-6 hover:border-teal hover:-translate-y-1 transition-all"
                    >
                      <div className="rounded-xl w-12 h-12 flex items-center justify-center mb-5 bg-teal-soft group-hover:bg-teal transition-colors">
                        <Icon className="h-5 w-5 text-teal group-hover:text-teal-foreground" />
                      </div>
                      <h3 className="font-semibold mb-2">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      {visible("how_it_works") && (
        <section id="how" className="py-28 px-4 bg-teal-soft/40">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-3 mb-4">
                <span className="h-px w-8 bg-rust" />
                <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">How It Works</span>
              </div>
              <h2 className="font-serif text-4xl sm:text-5xl tracking-tight">{how.title}</h2>
              <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">{how.subtitle}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {(how.content.items || [])
                .filter((s: any) => s.active !== false)
                .map((s: any, i: number) => (
                  <div key={`${s.title}-${i}`} className="bg-card border border-border/70 rounded-2xl p-8 relative">
                    <div className="absolute -top-4 left-8 bg-teal text-teal-foreground rounded-full px-3 py-1 text-xs font-bold tracking-wider">
                      STEP {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3 className="font-serif text-2xl mb-3 mt-2">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {s.description || "A simple, transparent way to get more from StratusPOS."}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {visible("testimonials") && (
        <section id="testimonials" className="py-28 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-3 mb-4">
                <span className="h-px w-8 bg-rust" />
                <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">Testimonials</span>
              </div>
              <h2 className="font-serif text-4xl sm:text-5xl tracking-tight">{testimonials.title}</h2>
              <p className="text-muted-foreground mt-4">{testimonials.subtitle}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {(testimonials.content.items || [])
                .filter((t: any) => t.active !== false)
                .map((t: any, i: number) => (
                  <figure key={`${t.name}-${i}`} className="bg-card border border-border/60 rounded-2xl p-7">
                    <blockquote className="font-serif text-xl leading-relaxed mb-6">“{t.review || t.quote}”</blockquote>
                    <figcaption className="flex items-center gap-3 pt-4 border-t border-border/60">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center font-semibold bg-teal text-teal-foreground">
                        {(t.name || "S").charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.company || t.role}</div>
                      </div>
                    </figcaption>
                  </figure>
                ))}
            </div>
          </div>
        </section>
      )}

      {visible("pricing") && (
        <section id="pricing" className="py-28 px-4 bg-teal-soft/40">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-3 mb-4">
                <span className="h-px w-8 bg-rust" />
                <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">Pricing</span>
              </div>
              <h2 className="font-serif text-4xl sm:text-5xl tracking-tight mb-4">{pricing.title}</h2>
              <p className="text-muted-foreground mb-8">{pricing.subtitle}</p>
              {pricing.content.show_monthly !== false && pricing.content.show_yearly !== false && (
                <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
                  <button
                    onClick={() => setBillingCycle("monthly")}
                    className={`px-5 py-2 rounded-full text-sm font-medium ${billingCycle === "monthly" ? "bg-teal text-teal-foreground" : "text-muted-foreground"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle("yearly")}
                    className={`px-5 py-2 rounded-full text-sm font-medium ${billingCycle === "yearly" ? "bg-teal text-teal-foreground" : "text-muted-foreground"}`}
                  >
                    Yearly
                  </button>
                </div>
              )}
            </div>
            {pricing.content.load_from_db === false ? (
              <p className="text-center text-muted-foreground">
                Pricing is managed by the subscription package system.
              </p>
            ) : packages.length === 0 ? (
              <p className="text-center text-muted-foreground">Pricing plans coming soon.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {packages.map((pkg, i) => {
                  const featured = i === 1;
                  return (
                    <div
                      key={pkg.id}
                      className={`relative rounded-2xl p-8 bg-card ${featured ? "border-2 border-teal shadow-xl lg:scale-105" : "border border-border/70 shadow-xs"}`}
                    >
                      {featured && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rust text-rust-foreground px-3 py-1 rounded-full text-xs font-bold">
                          MOST POPULAR
                        </div>
                      )}
                      <h3 className="font-serif text-2xl">{pkg.name}</h3>
                      {pkg.description && <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>}
                      <div className="mt-6 mb-6">
                        <span className="font-serif text-5xl font-medium">
                          {formatKES(billingCycle === "monthly" ? pkg.monthly_price_kes : pkg.yearly_price_kes)}
                        </span>
                        <span className="text-muted-foreground ml-1 text-sm">
                          /{billingCycle === "monthly" ? "mo" : "yr"}
                        </span>
                      </div>
                      <Button
                        className={`w-full mb-6 h-11 rounded-xl ${featured ? "bg-rust hover:bg-rust/90 text-rust-foreground" : "bg-foreground text-background"}`}
                        asChild
                      >
                        <Link to="/onboarding">Start Free Trial</Link>
                      </Button>
                      <ul className="space-y-3">
                        <li className="flex gap-2.5 text-sm">
                          <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                          {pkg.max_locations} location{pkg.max_locations > 1 ? "s" : ""}
                        </li>
                        <li className="flex gap-2.5 text-sm">
                          <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                          {pkg.max_products.toLocaleString()} products
                        </li>
                        <li className="flex gap-2.5 text-sm">
                          <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                          {pkg.max_users} team member{pkg.max_users > 1 ? "s" : ""}
                        </li>
                        {pkg.features.map((f) => (
                          <li key={f} className="flex gap-2.5 text-sm">
                            <Check className="h-4 w-4 mt-0.5 shrink-0 text-teal" />
                            {f}
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
      )}

      {visible("faq") && (
        <section id="faq" className="py-28 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-3 mb-4">
                <span className="h-px w-8 bg-rust" />
                <span className="text-xs font-semibold tracking-[0.18em] text-rust uppercase">FAQ</span>
              </div>
              <h2 className="font-serif text-4xl sm:text-5xl tracking-tight">{faq.title}</h2>
              <p className="text-muted-foreground mt-4">{faq.subtitle}</p>
            </div>
            <div className="space-y-3">
              {(faq.content.items || [])
                .filter((x: any) => x.active !== false)
                .map((item: any) => (
                  <details key={item.question} className="group bg-card border border-border/70 rounded-xl px-5 py-4">
                    <summary className="flex items-center justify-between cursor-pointer list-none">
                      <span className="font-medium">{item.question}</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                  </details>
                ))}
            </div>
          </div>
        </section>
      )}

      {visible("cta") && (
        <section className="py-20 px-4">
          <div className="max-w-5xl mx-auto">
            <div className="relative overflow-hidden rounded-3xl p-12 sm:p-16 text-center bg-gradient-to-br from-teal to-teal-deep">
              {cta.content.background_image && (
                <img
                  src={cta.content.background_image}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-20"
                />
              )}
              <div className="relative">
                <h2 className="font-serif text-4xl sm:text-5xl text-teal-foreground mb-4 tracking-tight">
                  {cta.title}
                </h2>
                <p className="text-teal-foreground/80 text-lg mb-8 max-w-2xl mx-auto">{cta.subtitle}</p>
                <Button
                  size="lg"
                  asChild
                  className="rounded-xl bg-rust hover:bg-rust/90 text-rust-foreground h-12 px-8 text-base shadow-lg"
                >
                  <Link to={cta.content.button_url || "/onboarding"}>
                    {cta.content.button_text || "Get Started Free"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-border/60 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-teal flex items-center justify-center">
              <Store className="h-4 w-4 text-teal-foreground" />
            </div>
            <span className="font-bold">StratusPOS</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/refund-policy" className="hover:text-foreground">
              Refunds
            </Link>
            <Link to="/sign-in" className="hover:text-foreground">
              Login
            </Link>
            <Link to="/super-admin/login" className="hover:text-foreground">
              Admin
            </Link>
            <span className="hidden sm:inline">© {new Date().getFullYear()} Stratus Business Systems</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
