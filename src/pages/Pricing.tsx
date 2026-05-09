import { Link } from "react-router-dom";
import { Check, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    name: "Starter",
    price: "KES 1,500",
    period: "/month",
    description: "For single-shop owners getting started.",
    features: ["1 location", "Up to 500 products", "Up to 1,000 customers", "2 team members", "Email support"],
  },
  {
    name: "Growth",
    price: "KES 4,500",
    period: "/month",
    description: "For growing retailers with multiple staff.",
    features: ["Up to 3 locations", "Unlimited products", "Unlimited customers & suppliers", "10 team members", "Reports & accounting", "Priority support"],
    highlighted: true,
  },
  {
    name: "Business",
    price: "KES 9,500",
    period: "/month",
    description: "For established multi-branch operations.",
    features: ["Unlimited locations", "Unlimited everything", "Unlimited team members", "Advanced reports & banking", "Dedicated onboarding", "Priority support"],
  },
];

export default function Pricing() {
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
            <p className="text-muted-foreground max-w-xl mx-auto">All plans include a 14-day free trial. No card required to start. Cancel anytime.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-8 bg-card flex flex-col ${
                  p.highlighted ? "border-teal shadow-lg ring-1 ring-teal/30" : "border-border/60"
                }`}
              >
                <h3 className="font-serif text-2xl text-foreground">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-6">{p.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">{p.price}</span>
                  <span className="text-muted-foreground">{p.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="h-4 w-4 text-teal mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/sign-in" className="w-full">
                  <Button className="w-full" variant={p.highlighted ? "default" : "outline"}>
                    Start free trial
                  </Button>
                </Link>
              </div>
            ))}
          </div>

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
