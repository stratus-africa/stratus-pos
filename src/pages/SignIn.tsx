import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Package,
  Clock,
  XCircle,
  Info,
  ScanLine,
} from "lucide-react";
import BarcodeSignInDialog from "@/components/auth/BarcodeSignInDialog";

const HIGHLIGHTS = [
  "Dedicated subdomain & database",
  "POS, inventory, purchases & sales",
  "Multi-warehouse & barcode support",
  "Ready in under 60 seconds",
];

type ApprovalBanner =
  | { kind: "pending" }
  | { kind: "rejected"; reason?: string }
  | { kind: "info_requested"; message?: string }
  | { kind: "expired" }
  | null;

export default function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, signIn, signOut } = useAuth();
  const { needsOnboarding, loading: bizLoading } = useBusiness();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<ApprovalBanner>(params.get("pending") ? { kind: "pending" } : null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  if (!loading && user && !bizLoading && !saLoading && !banner) {
    if (isSuperAdmin) return <Navigate to="/super-admin" replace />;
    if (needsOnboarding) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setBanner(null);
    const { error } = await signIn(email, password);
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    // Check approval status before allowing access
    const { data: status } = await (supabase as any).rpc("my_business_approval_status");
    const row = Array.isArray(status) ? status[0] : status;
    if (row && row.approval_status && row.approval_status !== "approved") {
      const s = row.approval_status as string;
      await signOut();
      setSubmitting(false);
      if (s === "pending") setBanner({ kind: "pending" });
      else if (s === "rejected") setBanner({ kind: "rejected", reason: row.rejection_reason });
      else if (s === "info_requested") setBanner({ kind: "info_requested", message: row.info_request_message });
      else if (s === "expired") setBanner({ kind: "expired" });
      return;
    }

    toast.success("Welcome back!");
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return toast.error("Enter your email");
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent. Check your inbox.");
    setForgotOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-2">
      <aside className="relative hidden min-h-screen overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between p-12 xl:p-16">
        <div className="absolute inset-0 opacity-10" aria-hidden="true">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full border-[80px] border-current" />
          <div className="absolute -bottom-40 -right-20 h-[34rem] w-[34rem] rounded-full border-[90px] border-current" />
        </div>
        <div className="relative">
          <Link
            to="/landing"
            className="inline-flex items-center gap-2 text-sm font-medium opacity-90 hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" /> Back to website
          </Link>
        </div>
        <div className="relative mx-auto w-full max-w-xl py-12">
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight xl:text-5xl">Run your business smarter with StratusPOS.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 opacity-80">
            Manage sales, inventory, purchases and your entire business from one powerful workspace.
          </p>
          <div className="mt-10 border-t border-primary-foreground/20 pt-8">
            <ul className="space-y-4">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-center gap-3 text-sm font-medium">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10 ring-1 ring-primary-foreground/15">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="relative text-xs opacity-60">© {new Date().getFullYear()} StratusPOS</div>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center justify-between lg:hidden">
            <Link
              to="/landing"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Package className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight">StratusPOS</span>
            </div>
            <div className="pt-5">
              <h2 className="text-3xl font-bold tracking-tight">Sign in to your workspace</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Enter your email or User ID and password below.
              </p>
            </div>
          </div>

          {banner && <StatusBanner banner={banner} />}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email address or User ID</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com or your User ID"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pwd">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotOpen(true);
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="pwd"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="h-11 w-full">
              {submitting ? (
                "Signing in..."
              ) : (
                <>
                  Sign in <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-background px-3 text-muted-foreground">or</span>
            </div>
          </div>

          <Button type="button" variant="outline" onClick={() => setBarcodeOpen(true)} className="h-11 w-full">
            <ScanLine className="mr-2 h-4 w-4" /> Sign in with barcode
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            New to StratusPOS?{" "}
            <Link to="/onboarding" className="font-medium text-primary hover:underline">
              Create a workspace
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} StratusPOS. All rights reserved.
          </p>
        </div>
      </main>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your account email and we'll send you a link to set a new password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email-2">Email address</Label>
              <Input
                id="forgot-email-2"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-11"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={sendingReset}>
                {sendingReset ? "Sending…" : "Send reset link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BarcodeSignInDialog open={barcodeOpen} onOpenChange={setBarcodeOpen} />
    </div>
  );
}

function StatusBanner({ banner }: { banner: NonNullable<ApprovalBanner> }) {
  const styles: Record<string, { icon: any; color: string; title: string; body: string }> = {
    pending: {
      icon: Clock,
      color: "bg-amber-50 border-amber-200 text-amber-900",
      title: "Registration pending approval",
      body: "Your registration is under review. You'll receive an email as soon as your account is approved.",
    },
    rejected: {
      icon: XCircle,
      color: "bg-red-50 border-red-200 text-red-900",
      title: "Registration not approved",
      body:
        banner.kind === "rejected" && banner.reason
          ? `Reason: ${banner.reason}. Please contact support if you need assistance.`
          : "Your registration was not approved. Please contact support for details.",
    },
    info_requested: {
      icon: Info,
      color: "bg-blue-50 border-blue-200 text-blue-900",
      title: "More information needed",
      body:
        banner.kind === "info_requested" && banner.message
          ? banner.message
          : "Our team needs additional information from you. Please contact support.",
    },
    expired: {
      icon: Clock,
      color: "bg-slate-50 border-slate-200 text-slate-800",
      title: "Application expired",
      body: "Your registration was not reviewed in time. Please register again or contact support.",
    },
  };
  const s = styles[banner.kind];
  const Icon = s.icon;
  return (
    <div className={`rounded-lg border p-4 flex gap-3 ${s.color}`}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <div className="text-sm font-semibold">{s.title}</div>
        <div className="text-xs leading-relaxed">{s.body}</div>
      </div>
    </div>
  );
}
