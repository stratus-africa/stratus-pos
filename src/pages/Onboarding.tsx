import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
  Mail, Lock, Eye, EyeOff, Building2, Zap, Loader2, CreditCard, User, Phone, FileText, Hash,
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

const KRA_PIN_REGEX = /^[AP]\d{9}[A-Z]$/i;

const HIGHLIGHTS = [
  "Dedicated workspace & database",
  "POS, inventory, purchases & sales",
  "Multi-warehouse & barcode support",
  "Reviewed and activated within 1 business day",
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
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(420px,560px)] bg-white">
      <aside className="relative hidden lg:flex flex-col items-center justify-center p-12 overflow-hidden bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white">
        <div className="absolute -top-32 -left-32 w-[450px] h-[450px] rounded-full bg-white/15 blur-2xl" aria-hidden />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="relative max-w-md">
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-8 shadow-md">
            <Box className="h-7 w-7" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight tracking-tight mb-5">
            Register your<br />business
          </h1>
          <p className="text-white/85 leading-relaxed mb-10 text-base">
            Submit your business details. Our team will review and activate your workspace, then email you when you can sign in.
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

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <Link to="/landing" className="lg:hidden inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">StratusPOS</span>
          </div>

          <RegistrationForm hasUser={!!user} />

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

const RegistrationForm = ({ hasUser }: { hasUser: boolean }) => {
  const { signUp, signOut, user } = useAuth();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [kraPin, setKraPin] = useState("");
  const [businessRegNo, setBusinessRegNo] = useState("");
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
      const { data } = await (supabase as any).rpc("get_public_subscription_packages");
      const list = ((data as any[]) || []).map((p) => ({
        id: p.id, name: p.name,
        monthly_price_kes: p.monthly_price_kes, yearly_price_kes: p.yearly_price_kes,
        trial_days: p.trial_days, max_products: p.max_products,
        max_users: p.max_users, max_locations: p.max_locations,
      })) as Plan[];
      setPlans(list);
      const def = list.find(p => Number(p.monthly_price_kes) === 0) || list[0];
      if (def) setSelectedPlanId(def.id);
      setPlansLoading(false);
    })();
  }, []);

  const filled = useMemo(
    () => [!!companyName, !!contactPerson, !!contactPhone, !!email, password.length >= 8].filter(Boolean).length,
    [companyName, contactPerson, contactPhone, email, password]
  );

  const submitRegistration = async () => {
    if (!companyName.trim() || !contactPerson.trim() || !contactPhone.trim()) {
      toast.error("Company name, contact person and phone are required");
      return;
    }
    if (kraPin && !KRA_PIN_REGEX.test(kraPin.trim())) {
      toast.error("KRA PIN must be in the format A123456789Z");
      return;
    }
    if (!selectedPlanId) {
      toast.error("Please select a plan");
      return;
    }

    setSubmitting(true);

    // Step 1: create the auth account if we don't have one yet
    if (!hasUser) {
      if (password !== confirm) { toast.error("Passwords do not match"); setSubmitting(false); return; }
      if (password.length < 8) { toast.error("Password must be at least 8 characters"); setSubmitting(false); return; }

      const { error: signUpErr } = await signUp(email, password, contactPerson);
      if (signUpErr) { toast.error(signUpErr.message); setSubmitting(false); return; }
    }

    // Wait briefly for auth session / profile row to exist
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData.session?.user || user;
    if (!currentUser) {
      toast.success("Check your email to verify, then sign in to complete registration.");
      setSubmitting(false);
      return;
    }

    // Step 2: create the business as pending
    const businessId = crypto.randomUUID();
    const { error: bizError } = await supabase.from("businesses").insert({
      id: businessId,
      name: companyName.trim(),
      contact_person: contactPerson.trim(),
      contact_phone: contactPhone.trim(),
      kra_pin: kraPin.trim() || null,
      business_reg_no: businessRegNo.trim() || null,
      selected_package_id: selectedPlanId,
      owner_id: currentUser.id,
      approval_status: "pending",
      is_active: false,
    } as any);

    if (bizError) { toast.error(bizError.message); setSubmitting(false); return; }

    // Link profile
    await supabase.from("profiles").update({ business_id: businessId, full_name: contactPerson.trim() }).eq("id", currentUser.id);

    // Sign out — user must wait for approval before signing in
    await signOut();
    toast.success("Registration submitted! We'll email you once your account is approved.");
    navigate("/sign-in?pending=1", { replace: true });
    setSubmitting(false);
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void submitRegistration(); };

  return (
    <>
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">Register your business</h2>
        <p className="text-muted-foreground text-sm">
          Complete this form to apply. Our team reviews new registrations and activates approved accounts.
        </p>
      </div>

      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < filled ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-muted"
          }`} />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <IconField id="company" label="Business name *" icon={Building2}>
          <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="pl-10 h-11" placeholder="Acme Retail Ltd" />
        </IconField>

        <div className="grid grid-cols-2 gap-3">
          <IconField id="contact" label="Contact person *" icon={User}>
            <Input id="contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} required className="pl-10 h-11" placeholder="Jane Doe" />
          </IconField>
          <IconField id="phone" label="Phone *" icon={Phone}>
            <Input id="phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required className="pl-10 h-11" placeholder="+254 700 000 000" />
          </IconField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <IconField id="kra" label="KRA PIN" icon={Hash}>
            <Input id="kra" value={kraPin} onChange={(e) => setKraPin(e.target.value.toUpperCase())} className="pl-10 h-11" placeholder="A123456789Z" />
          </IconField>
          <IconField id="reg" label="Business Reg. No." icon={FileText}>
            <Input id="reg" value={businessRegNo} onChange={(e) => setBusinessRegNo(e.target.value)} className="pl-10 h-11" placeholder="Optional" />
          </IconField>
        </div>

        <IconField id="email" label="Admin email *" icon={Mail}>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={hasUser} className="pl-10 h-11" placeholder="you@company.com" />
        </IconField>

        {!hasUser && (
          <div className="grid grid-cols-2 gap-3">
            <IconField id="pwd" label="Password *" icon={Lock}>
              <div className="relative">
                <Input id="pwd" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="pl-10 pr-9 h-11" placeholder="Min. 8 chars" />
                <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </IconField>
            <IconField id="confirm" label="Confirm *" icon={CheckCircle2}>
              <Input id="confirm" type={showPwd ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className="pl-10 h-11" placeholder="Repeat" />
            </IconField>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="plan" className="text-sm font-medium">Plan *</Label>
          {plansLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : (
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger id="plan" className="pl-10 h-11 rounded-lg">
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
                      return <SelectItem key={p.id} value={p.id}>{p.name} — {label}{trial}</SelectItem>;
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Button type="submit" disabled={submitting}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-semibold shadow-md shadow-emerald-500/20">
          {submitting ? "Submitting…" : (<>Submit registration <ArrowRight className="ml-2 h-4 w-4" /></>)}
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

const IconField = ({ id, label, icon: Icon, children }: { id: string; label: string; icon: any; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
      {children}
    </div>
  </div>
);

export default Onboarding;
