import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { validateSignupEmail } from "@/lib/disposableEmails";
import {
  completeSelfSignup,
  emptyOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import ImportMappingDialog from "@/components/products/ImportMappingDialog";
import { mapProductImportRows, parseProductImportFile } from "@/lib/productImport";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  Hash,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
  User,
  Users,
  Wallet,
  Upload,
  FileSpreadsheet,
  Eye,
  EyeOff,
} from "lucide-react";

const STEPS = [
  { title: "Welcome", icon: CheckCircle2 },
  { title: "Business", icon: Building2 },
  { title: "Location", icon: MapPin },
  { title: "Products", icon: Package },
  { title: "POS & Payments", icon: Wallet },
  { title: "Team & Permissions", icon: Users },
  { title: "Finish", icon: ShieldCheck },
];

const BUSINESS_TYPES = ["Retail", "Wholesale", "Supermarket", "Pharmacy", "Restaurant", "Hardware", "Other"];

const Onboarding = () => {
  const { user, loading: authLoading } = useAuth();
  const { needsOnboarding, loading: bizLoading } = useBusiness();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  if (authLoading || (user && (bizLoading || saLoading))) {
    return <LoadingScreen />;
  }

  if (user && isSuperAdmin) return <Navigate to="/super-admin" replace />;
  if (user && !needsOnboarding) return <Navigate to="/" replace />;

  return user ? <SelfSignupWizard userId={user.id} email={user.email || ""} /> : <SignupGate />;
};

const SignupGate = () => {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateSignupEmail(email);
    if (emailError) return toast.error(emailError);
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    if (!fullName.trim()) return toast.error("Enter your full name");

    setSubmitting(true);
    const { error } = await signUp(email.trim(), password, fullName.trim());
    setSubmitting(false);
    if (error) return toast.error(error.message);

    setVerificationSent(true);
    toast.success("Account created. Check your email to verify your account.");
  };

  if (verificationSent) {
    return <AuthShell title="Verify your email" subtitle={`We sent a verification link to ${email}.`}>
      <div className="rounded-2xl border bg-muted/30 p-6 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Mail className="h-7 w-7" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">One quick step first</h3>
          <p className="text-sm text-muted-foreground mt-1">Open the email and click Verify Email. You’ll be taken directly into the 7-step setup wizard.</p>
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={() => setVerificationSent(false)}>Use another email</Button>
      </div>
    </AuthShell>;
  }

  return <AuthShell title="Create your StratusPOS account" subtitle="Create your account first. After email verification, we’ll guide you through your business setup.">
    <form onSubmit={submit} className="space-y-4">
      <Field id="fullName" label="Your name" icon={User}>
        <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="pl-10 h-11" />
      </Field>
      <Field id="email" label="Email address" icon={Mail}>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10 h-11" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="password" label="Password" icon={Lock}>
          <div className="relative"><Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} placeholder="Min. 8 chars" className="pl-10 pr-9 h-11" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
        </Field>
        <Field id="confirm" label="Confirm password" icon={CheckCircle2}>
          <Input id="confirm" type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} placeholder="Repeat" className="pl-10 h-11" />
        </Field>
      </div>
      <Button disabled={submitting} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…</> : <>Create account <ArrowRight className="ml-2 h-4 w-4" /></>}
      </Button>
      <p className="text-xs text-center text-muted-foreground">Already have an account? <Link to="/sign-in" className="text-emerald-600 font-medium hover:underline">Sign in</Link></p>
    </form>
  </AuthShell>;
};

const SelfSignupWizard = ({ userId, email }: { userId: string; email: string }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<OnboardingDraft>(() => emptyOnboardingDraft(email));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupBusinessId, setSetupBusinessId] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await loadOnboardingDraft(userId, email);
        if (!active) return;
        setStep(result.step);
        setDraft(result.draft);
        if (result.completed) navigate("/", { replace: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to load your setup");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [email, navigate, userId]);

  const update = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const next = async () => {
    if (!validateStep(step, draft)) return;
    setSaving(true);
    try {
      await saveOnboardingDraft(userId, Math.min(7, step + 1), draft);
      setStep((s) => Math.min(7, s + 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your progress");
    } finally {
      setSaving(false);
    }
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  const finish = async () => {
    if (!validateStep(7, draft)) return;
    setCreating(true);
    try {
      await saveOnboardingDraft(userId, 7, draft);
      const result = await completeSelfSignup();
      setSetupBusinessId(result.business_id);
      setSetupComplete(true);
      toast.success("Your StratusPOS workspace has been created.");
      setTimeout(() => navigate("/", { replace: true }), 1600);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create your workspace");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (setupComplete) return <WorkspaceSetup businessId={setupBusinessId} />;

  const CurrentStep = [
    <WelcomeStep draft={draft} update={update} />,
    <BusinessStep draft={draft} update={update} />,
    <LocationStep draft={draft} update={update} />,
    <ProductsStep draft={draft} update={update} />,
    <PaymentsStep draft={draft} update={update} />,
    <TeamStep draft={draft} update={update} />,
    <FinishStep draft={draft} update={update} />,
  ][step - 1];

  return <div className="min-h-screen bg-slate-50">
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white"><Box className="h-5 w-5" /></div><span className="font-bold text-lg">StratusPOS</span></div>
        <span className="text-xs text-muted-foreground hidden sm:block">Setting up {email}</span>
      </div>
    </header>
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid lg:grid-cols-[250px_1fr] gap-8">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Workspace setup</p>
          <div className="space-y-1">
            {STEPS.map((item, index) => {
              const number = index + 1;
              const Icon = item.icon;
              const active = number === step;
              const complete = number < step;
              return <button key={item.title} type="button" onClick={() => number < step && setStep(number)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? "bg-emerald-50 text-emerald-700" : complete ? "hover:bg-white" : "text-muted-foreground"}`}>
                <span className={`h-8 w-8 rounded-full flex items-center justify-center border text-xs font-semibold ${active ? "border-emerald-500 bg-emerald-500 text-white" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "bg-white"}`}>{complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
                <span><span className="block text-sm font-medium">{number}. {item.title}</span>{active && <span className="text-[11px] text-emerald-600">Current step</span>}</span>
              </button>;
            })}
          </div>
          <p className="mt-6 text-xs text-muted-foreground leading-relaxed">Your progress is saved as you move through the wizard. You can safely leave and return later.</p>
        </aside>
        <section className="rounded-2xl border bg-white shadow-sm p-5 sm:p-8 min-h-[600px] flex flex-col">
          <div className="mb-8"><div className="flex justify-between text-xs text-muted-foreground mb-2"><span>Step {step} of 7</span><span>{Math.round((step / 7) * 100)}%</span></div><div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all" style={{ width: `${(step / 7) * 100}%` }} /></div></div>
          <div className="flex-1">{CurrentStep}</div>
          <div className="mt-10 pt-5 border-t flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={back} disabled={step === 1 || saving || creating}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
            {step < 7 ? <Button type="button" onClick={next} disabled={saving} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white min-w-32">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>}</Button> : <Button type="button" onClick={finish} disabled={creating} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white min-w-44">{creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : <>Create my workspace <Check className="ml-2 h-4 w-4" /></>}</Button>}
          </div>
        </section>
      </div>
    </main>
  </div>;
};

const WelcomeStep = ({ draft, update }: StepProps) => <Step title="Welcome to StratusPOS" description="Let’s configure your workspace in seven guided steps. Nothing is created until you finish the wizard.">
  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-6 space-y-5">
    <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm"><Store className="h-6 w-6 text-emerald-600" /></div>
    <div><h3 className="font-semibold text-lg">Your account is ready.</h3><p className="text-sm text-muted-foreground mt-1">We’ll create your business only after you confirm the final setup.</p></div>
    <div className="grid sm:grid-cols-3 gap-3">{["Business profile", "POS & payments", "Team permissions"].map((x) => <div key={x} className="rounded-xl bg-white/80 p-3 text-sm font-medium">✓ {x}</div>)}</div>
  </div>
  <div className="mt-5"><Label>Account email</Label><Input value={draft.account.email} readOnly className="mt-1.5 bg-muted/40" /></div>
</Step>;

const BusinessStep = ({ draft, update }: StepProps) => <Step title="Tell us about your business" description="These details become your StratusPOS business profile.">
  <div className="grid sm:grid-cols-2 gap-4">
    <Field id="companyName" label="Business name *" icon={Building2}><Input id="companyName" value={draft.business.companyName} onChange={(e) => update("business", { ...draft.business, companyName: e.target.value })} placeholder="Acme Retail Ltd" className="pl-10 h-11" /></Field>
    <div className="space-y-1.5"><Label>Business type *</Label><Select value={draft.business.businessType} onValueChange={(value) => update("business", { ...draft.business, businessType: value.toLowerCase() })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{BUSINESS_TYPES.map((x) => <SelectItem key={x} value={x.toLowerCase()}>{x}</SelectItem>)}</SelectContent></Select></div>
    <Field id="contactPerson" label="Contact person *" icon={User}><Input id="contactPerson" value={draft.business.contactPerson} onChange={(e) => update("business", { ...draft.business, contactPerson: e.target.value })} placeholder="Jane Doe" className="pl-10 h-11" /></Field>
    <Field id="contactPhone" label="Phone *" icon={Phone}><Input id="contactPhone" value={draft.business.contactPhone} onChange={(e) => update("business", { ...draft.business, contactPhone: e.target.value })} placeholder="+254 700 000 000" className="pl-10 h-11" /></Field>
    <Field id="kraPin" label="KRA PIN" icon={Hash}><Input id="kraPin" value={draft.business.kraPin} onChange={(e) => update("business", { ...draft.business, kraPin: e.target.value.toUpperCase() })} placeholder="A123456789Z" className="pl-10 h-11" /></Field>
    <Field id="businessRegNo" label="Business registration no." icon={FileText}><Input id="businessRegNo" value={draft.business.businessRegNo} onChange={(e) => update("business", { ...draft.business, businessRegNo: e.target.value })} placeholder="Optional" className="pl-10 h-11" /></Field>
  </div>
</Step>;

const LocationStep = ({ draft, update }: StepProps) => <Step title="Create your first location" description="Every StratusPOS business starts with at least one store, branch or warehouse.">
  <div className="grid sm:grid-cols-2 gap-4">
    <Field id="locationName" label="Location name *" icon={Store}><Input id="locationName" value={draft.location.name} onChange={(e) => update("location", { ...draft.location, name: e.target.value })} placeholder="Main Branch" className="pl-10 h-11" /></Field>
    <div className="space-y-1.5"><Label>Location type</Label><Select value={draft.location.type} onValueChange={(value: "store" | "warehouse") => update("location", { ...draft.location, type: value })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="store">Store / Branch</SelectItem><SelectItem value="warehouse">Warehouse</SelectItem></SelectContent></Select></div>
    <div className="sm:col-span-2"><Field id="address" label="Address" icon={MapPin}><Input id="address" value={draft.location.address} onChange={(e) => update("location", { ...draft.location, address: e.target.value })} placeholder="Street / building" className="pl-10 h-11" /></Field></div>
    <Field id="city" label="City" icon={MapPin}><Input id="city" value={draft.location.city} onChange={(e) => update("location", { ...draft.location, city: e.target.value })} placeholder="Nairobi" className="pl-10 h-11" /></Field>
    <Field id="county" label="County" icon={MapPin}><Input id="county" value={draft.location.county} onChange={(e) => update("location", { ...draft.location, county: e.target.value })} placeholder="Nairobi County" className="pl-10 h-11" /></Field>
  </div>
</Step>;

const ProductsStep = ({ draft, update }: StepProps) => {
  const [mappingOpen, setMappingOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [reading, setReading] = useState(false);

  const chooseMode = (mode: OnboardingDraft["products"]["mode"]) =>
    update("products", { ...draft.products, mode });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReading(true);
    try {
      const parsed = await parseProductImportFile(file);
      setRows(parsed.rows);
      setHeaders(parsed.headers);
      setMappingOpen(true);
      chooseMode("import");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read the product file");
    } finally {
      setReading(false);
      e.target.value = "";
    }
  };

  const confirmMapping = (mapping: Record<string, string | null>) => {
    const importRows = mapProductImportRows(rows, mapping);
    if (!importRows.length) {
      toast.error("No product rows with a Name column were found");
      return;
    }
    update("products", { mode: "import", importRows });
    setMappingOpen(false);
    toast.success(`${importRows.length} products ready to import when you finish setup`);
  };

  return <Step title="Set up your products" description="Use the same CSV/Excel importer available in Products. Your catalogue is staged now and created only when your workspace is created.">
    <div className="grid sm:grid-cols-3 gap-4">{[
      ["empty", "Start empty", "Add products later from Products."],
      ["import", "Import catalogue", "Upload CSV or Excel and map the columns now."],
      ["manual", "Add manually", "Create your first products from the dashboard."],
    ].map(([mode, title, description]) => <button key={mode} type="button" onClick={() => chooseMode(mode as OnboardingDraft["products"]["mode"])} className={`rounded-2xl border p-5 text-left transition ${draft.products.mode === mode ? "border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/50" : "hover:border-muted-foreground/30"}`}><Package className={`h-6 w-6 mb-4 ${draft.products.mode === mode ? "text-emerald-600" : "text-muted-foreground"}`} /><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground mt-1">{description}</p>{draft.products.mode === mode && <span className="inline-flex mt-4 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5 mr-1" /> Selected</span>}</button>)}</div>
    {draft.products.mode === "import" && <div className="mt-6 rounded-2xl border bg-white p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><p className="font-semibold">Product catalogue</p><p className="text-sm text-muted-foreground mt-1">{draft.products.importRows.length ? `${draft.products.importRows.length} products mapped and ready.` : "Upload your CSV, XLSX or XLS file to start."}</p></div>
        <label className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium cursor-pointer">
          <Upload className="mr-2 h-4 w-4" /> {reading ? "Reading…" : draft.products.importRows.length ? "Replace file" : "Choose file"}
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} disabled={reading} />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><FileSpreadsheet className="h-4 w-4" /> Uses the same column mapping and import fields as Products → Data → Import file.</div>
    </div>}
    <ImportMappingDialog open={mappingOpen} onOpenChange={setMappingOpen} headers={headers} sampleRow={rows[0]} importing={reading} onConfirm={confirmMapping} />
  </Step>;
};

const PaymentsStep = ({ draft, update }: StepProps) => <Step title="Configure POS & payments" description="Set the defaults your cashiers will use. You can change these later in Settings.">
  <div className="grid sm:grid-cols-2 gap-4">
    <Field id="currency" label="Currency" icon={CreditCard}><Input id="currency" value={draft.payments.currency} onChange={(e) => update("payments", { ...draft.payments, currency: e.target.value.toUpperCase() })} className="pl-10 h-11" /></Field>
    <Field id="taxRate" label="Default VAT / tax rate" icon={CreditCard}><Input id="taxRate" type="number" min="0" max="100" value={draft.payments.taxRate} onChange={(e) => update("payments", { ...draft.payments, taxRate: e.target.value })} className="pl-10 h-11" /></Field>
    <Toggle label="Enable VAT" checked={draft.payments.vatEnabled} onChange={(checked) => update("payments", { ...draft.payments, vatEnabled: checked })} />
    <Toggle label="Prices include tax" checked={draft.payments.taxInclusivePricing} onChange={(checked) => update("payments", { ...draft.payments, taxInclusivePricing: checked })} />
    <Toggle label="Enable M-Pesa" checked={draft.payments.mpesaEnabled} onChange={(checked) => update("payments", { ...draft.payments, mpesaEnabled: checked })} />
    <Toggle label="Auto-print receipts" checked={draft.payments.autoPrintReceipt} onChange={(checked) => update("payments", { ...draft.payments, autoPrintReceipt: checked })} />
    {draft.payments.mpesaEnabled && <><Field id="shortcode" label="M-Pesa shortcode" icon={Wallet}><Input id="shortcode" value={draft.payments.mpesaShortcode} onChange={(e) => update("payments", { ...draft.payments, mpesaShortcode: e.target.value })} placeholder="Optional" className="pl-10 h-11" /></Field><Field id="paybill" label="Paybill / Till" icon={Wallet}><Input id="paybill" value={draft.payments.mpesaPaybillOrTill} onChange={(e) => update("payments", { ...draft.payments, mpesaPaybillOrTill: e.target.value })} placeholder="Optional" className="pl-10 h-11" /></Field></>}
  </div>
</Step>;

const TeamStep = ({ draft, update }: StepProps) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "cashier" | "stores_manager">("cashier");
  const add = () => { if (!name.trim() || !email.trim()) return toast.error("Enter the team member name and email"); update("team", { invites: [...draft.team.invites, { name: name.trim(), email: email.trim(), role }] }); setName(""); setEmail(""); };
  return <Step title="Set up your team" description="You remain the workspace owner and admin. Add the first staff members you plan to invite.">
    <div className="rounded-2xl border bg-muted/20 p-4 space-y-3"><div className="grid sm:grid-cols-[1fr_1fr_180px_auto] gap-3"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Staff name" /><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@company.com" type="email" /><Select value={role} onValueChange={(v: any) => setRole(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cashier">Cashier</SelectItem><SelectItem value="manager">Manager</SelectItem><SelectItem value="stores_manager">Stores Manager</SelectItem></SelectContent></Select><Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button></div></div>
    <div className="mt-5 space-y-2">{draft.team.invites.length === 0 ? <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-2xl">No team members added yet. You can invite them later.</div> : draft.team.invites.map((invite, index) => <div key={`${invite.email}-${index}`} className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium text-sm">{invite.name}</p><p className="text-xs text-muted-foreground">{invite.email} · {invite.role.replace("_", " ")}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => update("team", { invites: draft.team.invites.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button></div>)}</div>
    <p className="mt-4 text-xs text-muted-foreground">Invitations are saved with onboarding. The actual user accounts can be created from Team after your workspace is ready.</p>
  </Step>;
};

const FinishStep = ({ draft, update }: StepProps) => {
  const [plans, setPlans] = useState<Array<{ id: string; name: string; monthly_price_kes: number; trial_days: number }>>([]);
  useEffect(() => { (async () => { const { data } = await (supabase as any).rpc("get_public_subscription_packages"); const next = (data || []).map((p: any) => ({ id: p.id, name: p.name, monthly_price_kes: Number(p.monthly_price_kes || p.monthly_price || 0), trial_days: Number(p.trial_days || 0) })); setPlans(next); if (!draft.plan.packageId && next[0]) update("plan", { packageId: next[0].id }); })(); }, []);
  const selected = plans.find((p) => p.id === draft.plan.packageId);
  return <Step title="Review and create your workspace" description="Choose your starting plan, review the setup, then create your live StratusPOS workspace.">
    <div className="space-y-5">
      <div className="rounded-2xl border p-5 grid sm:grid-cols-2 gap-4 text-sm"><Summary label="Business" value={draft.business.companyName || "Not set"} /><Summary label="Location" value={draft.location.name || "Not set"} /><Summary label="Products" value={draft.products.mode === "empty" ? "Start empty" : draft.products.mode === "import" ? `${draft.products.importRows.length || 0} products to import` : "Add manually"} /><Summary label="Team" value={`${draft.team.invites.length} planned invite${draft.team.invites.length === 1 ? "" : "s"}`} /><Summary label="M-Pesa" value={draft.payments.mpesaEnabled ? "Enabled" : "Disabled"} /><Summary label="VAT" value={draft.payments.vatEnabled ? `${draft.payments.taxRate}%` : "Disabled"} /></div>
      <div className="space-y-2"><Label>Choose your starting plan</Label><Select value={draft.plan.packageId} onValueChange={(packageId) => update("plan", { packageId })}><SelectTrigger className="h-12"><SelectValue placeholder="Select a plan" /></SelectTrigger><SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — KES {p.monthly_price_kes.toLocaleString()}/mo{p.trial_days ? ` · ${p.trial_days}-day trial` : ""}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">You can change plans later. Free/trial packages are initialized automatically when the workspace is created.</p></div>
      {selected && <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 inline mr-2" />Selected: <strong>{selected.name}</strong>{selected.trial_days ? ` with a ${selected.trial_days}-day trial.` : "."}</div>}
    </div>
  </Step>;
};

const WorkspaceSetup = ({ businessId }: { businessId: string }) => <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4"><div className="w-full max-w-lg rounded-2xl border bg-white shadow-sm p-8 text-center"><div className="mx-auto h-16 w-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5"><CheckCircle2 className="h-8 w-8" /></div><h1 className="text-2xl font-bold">Your workspace is ready</h1><p className="text-muted-foreground mt-2">StratusPOS created your business, first location, owner account and permissions.</p><div className="mt-6 space-y-3 text-left">{["Business profile created", "Main location configured", "Owner permissions initialized", "POS defaults saved", "Dashboard prepared"].map((x) => <div key={x} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-emerald-600" />{x}</div>)}</div><p className="mt-6 text-xs text-muted-foreground">Workspace ID: {businessId}</p><div className="mt-6 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full w-full bg-emerald-500 animate-pulse" /></div><p className="mt-2 text-xs text-muted-foreground">Opening your dashboard…</p></div></div>;

function validateStep(step: number, draft: OnboardingDraft) {
  if (step === 2) {
    if (!draft.business.companyName.trim() || !draft.business.contactPerson.trim() || !draft.business.contactPhone.trim()) { toast.error("Business name, contact person and phone are required"); return false; }
    if (draft.business.kraPin && !/^[AP]\d{9}[A-Z]$/i.test(draft.business.kraPin.trim())) { toast.error("KRA PIN must be in the format A123456789Z"); return false; }
  }
  if (step === 3 && !draft.location.name.trim()) { toast.error("Enter a location name"); return false; }
  if (step === 4 && draft.products.mode === "import" && draft.products.importRows.length === 0) { toast.error("Choose a product file and map its columns, or select another option"); return false; }
  if (step === 5 && (Number.isNaN(Number(draft.payments.taxRate)) || Number(draft.payments.taxRate) < 0 || Number(draft.payments.taxRate) > 100)) { toast.error("Enter a valid tax rate between 0 and 100"); return false; }
  if (step === 7 && !draft.plan.packageId) { toast.error("Choose a starting plan"); return false; }
  return true;
}

type StepProps = { draft: OnboardingDraft; update: <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => void };

const Step = ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1><p className="text-muted-foreground mt-2 max-w-2xl">{description}</p><div className="mt-8">{children}</div></div>;

const Field = ({ id, label, icon: Icon, children }: { id: string; label: string; icon: any; children: React.ReactNode }) => <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><div className="relative"><Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />{children}</div></div>;

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) => <button type="button" onClick={() => onChange(!checked)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left ${checked ? "border-emerald-200 bg-emerald-50/50" : ""}`}><span className="text-sm font-medium">{label}</span><span className={`h-5 w-9 rounded-full p-0.5 transition ${checked ? "bg-emerald-500" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-4" : ""}`} /></span></button>;

const Summary = ({ label, value }: { label: string; value: string }) => <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium mt-0.5 capitalize">{value}</p></div>;

const AuthShell = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(420px,560px)] bg-white"><aside className="relative hidden lg:flex flex-col justify-center p-12 overflow-hidden bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white"><div className="relative max-w-md"><div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center mb-8"><Box className="h-7 w-7" /></div><h1 className="text-4xl font-bold leading-tight">Build your<br />workspace in minutes.</h1><p className="text-white/85 mt-5 leading-relaxed">Create your account, verify your email, then let the seven-step wizard configure StratusPOS around your business.</p><div className="mt-8 space-y-3 text-sm">{["No manual business approval", "Progress is saved automatically", "Owner permissions are initialized for you"].map((x) => <div key={x} className="flex gap-2 items-center"><CheckCircle2 className="h-4 w-4" />{x}</div>)}</div></div></aside><main className="flex items-center justify-center p-6 sm:p-10"><div className="w-full max-w-md space-y-6"><Link to="/landing" className="text-sm text-muted-foreground hover:text-foreground">← Back to homepage</Link><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white"><Box className="h-5 w-5" /></div><span className="text-xl font-bold">StratusPOS</span></div><div><h2 className="text-3xl font-bold tracking-tight">{title}</h2><p className="text-muted-foreground text-sm mt-2 leading-relaxed">{subtitle}</p></div>{children}</div></main></div>;

const LoadingScreen = () => <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;

export default Onboarding;
