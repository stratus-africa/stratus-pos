import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Box, CheckCircle2, ArrowLeft, ArrowRight,
  Mail, Lock, Eye, EyeOff, Building2, Zap, Loader2, CreditCard,
} from "lucide-react";

interface Plan {
  id: string;
  name: string;
  monthly_price_kes: number;
  yearly_price_kes: number;
  trial_days: number;
  max_products: number;
  max_users: number;
  max_locations: number;
}

const fmtKes = (n: number) =>
  `KES ${new Intl.NumberFormat("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}`;

const HIGHLIGHTS = [
  "Dedicated workspace & database",
  "POS, inventory, purchases & sales",
  "Multi-warehouse & barcode support",
  "Ready in under 60 seconds",
];



const Onboarding = () => {
  const { user, loading: authLoading } = useAuth();
  const { needsOnboarding, loading: bizLoading } = useBusiness();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  if (authLoading || (user && (bizLoading || saLoading))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (user && isSuperAdmin) return <Navigate to="/super-admin" replace />;
  if (user && !needsOnboarding) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(420px,520px)] bg-white">
      {/* Left: green gradient panel */}
      <aside className="relative hidden lg:flex flex-col items-center justify-center p-12 overflow-hidden bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white">
        <div className="absolute -top-32 -left-32 w-[450px] h-[450px] rounded-full bg-white/15 blur-2xl" aria-hidden />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="absolute top-[55%] right-[18%] w-32 h-32 rounded-full bg-white/10" aria-hidden />
        <div className="absolute bottom-[18%] left-[18%] w-24 h-24 rounded-3xl bg-white/10" aria-hidden />

        <div className="relative max-w-md">
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-8 shadow-md">
            <Box className="h-7 w-7" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight tracking-tight mb-5">
            Launch your business<br />in minutes
          </h1>
          <p className="text-white/85 leading-relaxed mb-10 text-base">
            Get your own dedicated workspace with full inventory management,
            and everything you need to run your business.
          </p>

          <ul className="space-y-4 pt-8 border-t border-white/25">
            {HIGHLIGHTS.map(h => (
              <li key={h} className="flex items-center gap-3 text-white">
                <span className="h-7 w-7 rounded-full bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="text-[15px]">{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Right panel — single combined form */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <Link to="/landing" className="lg:hidden inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">StratusPOS</span>
          </div>

          <CreateWorkspaceForm hasUser={!!user} />

          <Button asChild variant="outline" className="w-full h-11 rounded-lg font-medium">
            <Link to="/landing"><ArrowLeft className="mr-2 h-4 w-4" /> Back to homepage</Link>
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            © {new Date().getFullYear()} StratusPOS. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
};

/* ---------------- Combined form: workspace + admin account + plan ---------------- */

const CreateWorkspaceForm = ({ hasUser }: { hasUser: boolean }) => {
  const { signUp } = useAuth();
  const { user } = useAuth();
  const { createBusiness } = useBusiness();

  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscription_packages")
        .select("id, name, monthly_price_kes, yearly_price_kes, trial_days, max_products, max_users, max_locations")
        .eq("is_active", true)
        .order("monthly_price_kes", { ascending: true });
      const list = (data as Plan[]) || [];
      setPlans(list);
      const def = list.find(p => Number(p.monthly_price_kes) === 0) || list[0];
      if (def) setSelectedPlanId(def.id);
      setPlansLoading(false);
    })();
  }, []);

  const filled = useMemo(
    () => [!!companyName, !!email, password.length >= 8, password === confirm && password.length >= 8].filter(Boolean).length,
    [companyName, email, password, confirm]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }

    setSubmitting(true);

    // Step 1: Create the auth account if needed
    if (!hasUser) {
      const { error: signUpErr } = await signUp(email, password, companyName);
      if (signUpErr) {
        toast.error(signUpErr.message);
        setSubmitting(false);
        return;
      }
      if (password !== confirm) {
        toast.error("Passwords do not match");
        setSubmitting(false);
        return;
      }
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters");
        setSubmitting(false);
        return;
      }
      toast.success("Check your email to verify, then sign in to finish setup.");
      setSubmitting(false);
      return;
    }

    // Step 2: User is logged in → create the business + initial location
    const { error } = await createBusiness(companyName, "Main Branch", "general");
    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    if (selectedPlanId && user) {
      const plan = plans.find(p => p.id === selectedPlanId);
      const trialDays = Math.max(0, plan?.trial_days ?? 14);
      const now = new Date();
      const trialEnd = new Date(now.getTime() + trialDays * 86400000);
      // Upsert keyed on (user_id, product_id) so refresh/retry never creates duplicates.
      await supabase.from("subscriptions").upsert(
        {
          user_id: user.id,
          product_id: selectedPlanId,
          status: trialDays > 0 ? "trialing" : "active",
          current_period_start: now.toISOString(),
          current_period_end: trialEnd.toISOString(),
          environment: "test",
        } as any,
        { onConflict: "user_id,product_id" }
      );
    }

    toast.success("Workspace created!");
    setSubmitting(false);
  };

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">Create your workspace</h2>
        <p className="text-muted-foreground text-sm">
          Set up your admin account and we'll get your workspace ready.
        </p>
      </div>

      {/* Progress dashes */}
      <div className="flex gap-2">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < filled ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Company name */}
        <div className="space-y-1.5">
          <Label htmlFor="company" className="text-sm font-medium">Company name</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="pl-10 h-11 rounded-lg focus-visible:ring-emerald-400 focus-visible:ring-offset-0"
              placeholder="Acme Inc."
            />
          </div>
        </div>

        {/* Admin email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium">Admin email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={hasUser}
              className="pl-10 h-11 rounded-lg focus-visible:ring-emerald-400 focus-visible:ring-offset-0"
              placeholder="you@company.com"
            />
          </div>
        </div>

        {/* Password / Confirm side by side */}
        {!hasUser && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pwd" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pwd"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pl-10 pr-9 h-11 rounded-lg focus-visible:ring-emerald-400 focus-visible:ring-offset-0"
                  placeholder="Min. 8 chars"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-sm font-medium">Confirm</Label>
              <div className="relative">
                <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type={showPwd ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  className="pl-10 h-11 rounded-lg focus-visible:ring-emerald-400 focus-visible:ring-offset-0"
                  placeholder="Repeat"
                />
              </div>
            </div>
          </div>
        )}

        {/* Plan selector — dropdown */}
        <div className="space-y-1.5">
          <Label htmlFor="plan" className="text-sm font-medium">Plan</Label>
          {plansLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : (
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger id="plan" className="pl-10 h-11 rounded-lg focus:ring-emerald-400 focus:ring-offset-0">
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.length === 0 ? (
                    <SelectItem value="__none" disabled>No plans available</SelectItem>
                  ) : (
                    plans.map(p => {
                      const monthly = Number(p.monthly_price_kes || 0);
                      const label = monthly === 0 ? "Free" : fmtKes(monthly) + "/mo";
                      const trial = p.trial_days > 0 ? ` · ${p.trial_days}-day trial` : "";
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {label}{trial}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-semibold shadow-md shadow-emerald-500/20"
        >
          {submitting ? "Creating workspace..." : (<>Create workspace <ArrowRight className="ml-2 h-4 w-4" /></>)}
        </Button>

        {!hasUser && (
          <p className="text-xs text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to="/sign-in" className="text-emerald-600 font-medium hover:underline">Sign in</Link>
          </p>
        )}
      </form>
    </>
  );
};

export default Onboarding;
