import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CreditCard,
  Package,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  WalletCards,
  Zap,
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

function ShoppingCartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <circle cx="9" cy="20" r="1" />
      <circle cx="19" cy="20" r="1" />
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6" />
    </svg>
  );
}

const featureIcons = [Zap, ShoppingCartIcon, Package, BarChart3, Users, Smartphone, ShieldCheck, Store];
const statIcons = [Store, Package, Users, BarChart3];

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
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(amount);

  const visible = (key: SectionKey) => sections[key]?.is_visible !== false;

  const hero = sections.hero;
  const stats = sections.stats;
  const features = sections.features;
  const how = sections.how_it_works;
  const testimonials = sections.testimonials;
  const pricing = sections.pricing;
  const faq = sections.faq;
  const cta = sections.cta;

  const paymentMethods = [
    { label: "M-Pesa", icon: WalletCards },
    { label: "Paystack", icon: CreditCard },
    { label: "Cash", icon: WalletCards },
    { label: "Cards", icon: CreditCard },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fbfdfc] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-8">
          <Link to="/landing" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal text-white shadow-sm">
              <Store className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">StratusPOS</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {visible("features") && (
              <a href="#features" className="text-sm font-medium text-slate-600 hover:text-slate-950">
                Features
              </a>
            )}
            {visible("pricing") && (
              <Link to="/pricing" className="text-sm font-medium text-slate-600 hover:text-slate-950">
                Pricing
              </Link>
            )}
            {visible("how_it_works") && (
              <a href="#how" className="text-sm font-medium text-slate-600 hover:text-slate-950">
                How it works
              </a>
            )}
            {visible("testimonials") && (
              <a href="#testimonials" className="text-sm font-medium text-slate-600 hover:text-slate-950">
                Customers
              </a>
            )}
            {visible("faq") && (
              <a href="#faq" className="text-sm font-medium text-slate-600 hover:text-slate-950">
                FAQ
              </a>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/sign-in"
              className="hidden px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-950 sm:inline"
            >
              Login
            </Link>
            <Button
              asChild
              className="h-10 rounded-xl bg-teal px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-deep"
            >
              <Link to="/onboarding">
                Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {visible("hero") && (
        <section className="relative overflow-hidden border-b border-slate-200 bg-white">
          <div className="absolute -left-40 top-12 h-96 w-96 rounded-full bg-teal/10 blur-3xl" />
          <div className="absolute -right-32 top-20 h-[28rem] w-[28rem] rounded-full bg-emerald-100/70 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:py-24">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal/20 bg-teal/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-teal">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                {hero.subtitle || "Modern POS for growing businesses"}
              </div>

              <h1 className="max-w-3xl text-5xl font-bold leading-[1.04] tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-[4.35rem]">
                {hero.title}
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">{hero.content.description}</p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-xl bg-teal px-7 text-base font-semibold text-white shadow-lg shadow-teal/15 hover:bg-teal-deep"
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
                    className="h-12 rounded-xl border-slate-300 bg-white px-7 text-base font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <a href={hero.content.secondary_url || "#features"}>{hero.content.secondary_text}</a>
                  </Button>
                )}
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                {["Multi-location ready", "Real-time inventory", "Secure & reliable"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-teal" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-[2.5rem] bg-teal/5 blur-2xl" />
              <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_25px_70px_-25px_rgba(15,23,42,.22)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Business overview</p>
                    <p className="mt-1 font-semibold text-slate-900">Today at a glance</p>
                  </div>
                  <div className="rounded-lg bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal">Live</div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-5">
                  {[
                    ["Today's Sales", "KES 84,620", "+18.4%"],
                    ["Orders", "128", "+12.1%"],
                    ["Stock Value", "KES 1.42M", "+4.6%"],
                    ["Gross Profit", "KES 31,880", "+16.7%"],
                  ].map(([label, value, change]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                      <p className="text-xs font-medium text-slate-500">{label}</p>
                      <p className="mt-2 text-xl font-bold tracking-tight text-slate-900">{value}</p>
                      <p className="mt-1 text-xs font-semibold text-teal">{change} vs previous</p>
                    </div>
                  ))}
                </div>

                <div className="mx-5 mb-5 rounded-xl border border-slate-100 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm font-semibold">Sales performance</p>
                    <span className="text-xs text-slate-400">Last 7 days</span>
                  </div>
                  <div className="flex h-28 items-end gap-2">
                    {[42, 55, 48, 72, 64, 84, 96, 76, 88, 100, 86, 92].map((height, i) => (
                      <div key={i} className="flex-1 rounded-t-md bg-teal/15">
                        <div className="w-full rounded-t-md bg-teal" style={{ height: `${height}%` }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-center">
                  <div>
                    <p className="text-xs text-slate-400">Low stock</p>
                    <p className="mt-1 font-bold text-amber-600">8</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Locations</p>
                    <p className="mt-1 font-bold text-slate-900">4</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Team</p>
                    <p className="mt-1 font-bold text-slate-900">18</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative border-t border-slate-100 bg-slate-50/70">
            <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-6 lg:flex-row lg:justify-between lg:px-8">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
                Built for the way you get paid
              </span>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {paymentMethods.map(({ label, icon: Icon }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm"
                  >
                    <Icon className="h-4 w-4 text-teal" />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {visible("stats") && (
        <section className="border-b border-slate-200 bg-white px-5 py-10 lg:px-8">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-slate-200 md:grid-cols-4">
            {(stats.content.items || [])
              .filter((s: any) => s.active !== false)
              .map((s: any, i: number) => {
                const Icon = statIcons[i % statIcons.length];
                return (
                  <div key={`${s.label}-${i}`} className="px-4 text-center md:px-8">
                    <Icon className="mx-auto h-5 w-5 text-teal" />
                    <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{s.value}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{s.label}</div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {visible("features") && (
        <section id="features" className="bg-[#fbfdfc] px-5 py-24 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <span className="text-sm font-bold uppercase tracking-[0.14em] text-teal">Everything in one place</span>
              <h2 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">
                {features.title}
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">{features.subtitle}</p>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {(features.content.items || [])
                .filter((f: any) => f.active !== false)
                .map((f: any, i: number) => {
                  const Icon = featureIcons[i % featureIcons.length];
                  return (
                    <div
                      key={`${f.title}-${i}`}
                      className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-teal/30 hover:shadow-lg"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/10 text-teal transition group-hover:bg-teal group-hover:text-white">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-5 font-bold text-slate-950">{f.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{f.description}</p>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      {visible("how_it_works") && (
        <section id="how" className="border-y border-slate-200 bg-white px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="text-sm font-bold uppercase tracking-[0.14em] text-teal">Simple to get started</span>
              <h2 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">{how.title}</h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">{how.subtitle}</p>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {(how.content.items || [])
                .filter((s: any) => s.active !== false)
                .map((s: any, i: number) => (
                  <div key={`${s.title}-${i}`} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-7">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3 className="mt-6 text-xl font-bold text-slate-950">{s.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {s.description || "A simple, transparent way to get more from StratusPOS."}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {visible("testimonials") && (
        <section id="testimonials" className="bg-[#f6faf8] px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="text-sm font-bold uppercase tracking-[0.14em] text-teal">Trusted by businesses</span>
              <h2 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">
                {testimonials.title}
              </h2>
              <p className="mt-5 text-lg text-slate-600">{testimonials.subtitle}</p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {(testimonials.content.items || [])
                .filter((t: any) => t.active !== false)
                .map((t: any, i: number) => (
                  <figure key={`${t.name}-${i}`} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                    <div className="mb-5 flex gap-1 text-amber-500">★★★★★</div>
                    <blockquote className="text-base leading-7 text-slate-700">“{t.review || t.quote}”</blockquote>
                    <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                        {(t.name || "S").charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-950">{t.name}</div>
                        <div className="text-xs text-slate-500">{t.company || t.role}</div>
                      </div>
                    </figcaption>
                  </figure>
                ))}
            </div>
          </div>
        </section>
      )}

      {visible("pricing") && (
        <section id="pricing" className="border-y border-slate-200 bg-white px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="text-sm font-bold uppercase tracking-[0.14em] text-teal">Simple pricing</span>
              <h2 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">{pricing.title}</h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">{pricing.subtitle}</p>
              {pricing.content.show_monthly !== false && pricing.content.show_yearly !== false && (
                <div className="mt-8 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                  <button
                    onClick={() => setBillingCycle("monthly")}
                    className={`rounded-full px-5 py-2 text-sm font-semibold ${billingCycle === "monthly" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle("yearly")}
                    className={`rounded-full px-5 py-2 text-sm font-semibold ${billingCycle === "yearly" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                  >
                    Yearly
                  </button>
                </div>
              )}
            </div>

            {pricing.content.load_from_db === false ? (
              <p className="mt-12 text-center text-slate-500">Pricing is managed by the subscription package system.</p>
            ) : packages.length === 0 ? (
              <p className="mt-12 text-center text-slate-500">Pricing plans coming soon.</p>
            ) : (
              <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {packages.map((pkg, i) => {
                  const featured = i === 1;
                  return (
                    <div
                      key={pkg.id}
                      className={`relative rounded-2xl p-8 ${featured ? "border-2 border-teal bg-white shadow-xl lg:-translate-y-2" : "border border-slate-200 bg-white shadow-sm"}`}
                    >
                      {featured && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal px-4 py-1 text-xs font-bold text-white">
                          MOST POPULAR
                        </div>
                      )}
                      <h3 className="text-2xl font-bold text-slate-950">{pkg.name}</h3>
                      {pkg.description && <p className="mt-2 text-sm text-slate-500">{pkg.description}</p>}
                      <div className="mb-6 mt-7">
                        <span className="text-4xl font-bold tracking-tight text-slate-950">
                          {formatKES(billingCycle === "monthly" ? pkg.monthly_price_kes : pkg.yearly_price_kes)}
                        </span>
                        <span className="ml-1 text-sm text-slate-500">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
                      </div>
                      <Button
                        className={`mb-6 h-11 w-full rounded-xl ${featured ? "bg-teal text-white hover:bg-teal-deep" : "bg-slate-950 text-white hover:bg-slate-800"}`}
                        asChild
                      >
                        <Link to="/onboarding">Start Free Trial</Link>
                      </Button>
                      <ul className="space-y-3">
                        <li className="flex gap-2.5 text-sm text-slate-600">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                          {pkg.max_locations} location{pkg.max_locations > 1 ? "s" : ""}
                        </li>
                        <li className="flex gap-2.5 text-sm text-slate-600">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                          {pkg.max_products.toLocaleString()} products
                        </li>
                        <li className="flex gap-2.5 text-sm text-slate-600">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                          {pkg.max_users} team member{pkg.max_users > 1 ? "s" : ""}
                        </li>
                        {pkg.features.map((f) => (
                          <li key={f} className="flex gap-2.5 text-sm text-slate-600">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
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
        <section id="faq" className="bg-[#fbfdfc] px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <span className="text-sm font-bold uppercase tracking-[0.14em] text-teal">Questions, answered</span>
              <h2 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">{faq.title}</h2>
              <p className="mt-5 text-lg text-slate-600">{faq.subtitle}</p>
            </div>
            <div className="mt-12 space-y-3">
              {(faq.content.items || [])
                .filter((x: any) => x.active !== false)
                .map((item: any) => (
                  <details
                    key={item.question}
                    className="group rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">
                      <span>{item.question}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 pr-8 text-sm leading-6 text-slate-600">{item.answer}</p>
                  </details>
                ))}
            </div>
          </div>
        </section>
      )}

      {visible("cta") && (
        <section className="bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="overflow-hidden rounded-3xl bg-teal px-7 py-14 text-center shadow-xl shadow-teal/10 sm:px-14">
              <h2 className="text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">{cta.title}</h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/80">{cta.subtitle}</p>
              <Button
                size="lg"
                asChild
                className="mt-8 h-12 rounded-xl bg-white px-8 text-base font-semibold text-teal shadow-sm hover:bg-slate-50"
              >
                <Link to={cta.content.button_url || "/onboarding"}>
                  {cta.content.button_text || "Get Started Free"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-slate-200 bg-white px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal text-white">
              <Store className="h-4 w-4" />
            </div>
            <span className="font-bold text-slate-950">StratusPOS</span>
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <Link to="/pricing" className="hover:text-slate-950">
              Pricing
            </Link>
            <Link to="/terms" className="hover:text-slate-950">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-slate-950">
              Privacy
            </Link>
            <Link to="/refund-policy" className="hover:text-slate-950">
              Refunds
            </Link>
            <Link to="/sign-in" className="hover:text-slate-950">
              Login
            </Link>
            <span className="hidden sm:inline">© {new Date().getFullYear()} Stratus Business Systems</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
