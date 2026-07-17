import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, CheckCircle2, Package, Clock, XCircle, Info } from "lucide-react";

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
  const [banner, setBanner] = useState<ApprovalBanner>(
    params.get("pending") ? { kind: "pending" } : null
  );

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

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
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(420px,520px)] bg-white">
      <aside className="relative hidden lg:flex flex-col justify-center p-12 overflow-hidden text-white bg-[linear-gradient(135deg,_#4fa373_0%,_#3d8f63_40%,_#2a7a52_100%)]">
        {/* soft circle decorations */}
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-white/10" aria-hidden />
        <div className="absolute top-1/2 left-1/3 w-40 h-40 rounded-full bg-white/[0.07]" aria-hidden />
        <div className="absolute bottom-40 left-40 w-24 h-24 rounded-3xl bg-white/[0.06]" aria-hidden />
        <div className="absolute -bottom-16 -right-16 w-[360px] h-[360px] rounded-full bg-white/10" aria-hidden />

        <div className="relative max-w-md mx-auto">
          {/* icon badge */}
          <div className="h-12 w-12 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center mb-8">
            <Package className="h-5 w-5 text-white" />
          </div>

          {/* headline */}
          <h1 className="text-4xl font-bold tracking-tight leading-[1.15] mb-5">
            Launch your business<br />in minutes
          </h1>
          <p className="text-white/85 leading-relaxed text-[15px] mb-8">
            Get your own dedicated workspace with a custom subdomain, full inventory management, and everything you need to run your business.
          </p>

          <div className="h-px bg-white/25 mb-8" aria-hidden />

          {/* highlights */}
          <ul className="space-y-4">
            {HIGHLIGHTS.map(h => (
              <li key={h} className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </span>
                <span className="text-sm text-white font-medium">{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <Link to="/landing" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>

          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Sign in to your workspace</h2>
            <p className="text-muted-foreground text-sm">Enter your email and password below.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="pl-10 h-11 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="pwd">Password</Label>
                <button
                  type="button"
                  onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pwd"
                  type={showPwd ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="pl-10 pr-9 h-11 rounded-lg"
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

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-md shadow-emerald-500/20"
            >
              {submitting ? "Signing in..." : (<>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>)}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/onboarding" className="text-emerald-600 font-medium hover:underline">Create workspace</Link>
          </p>

          <p className="text-xs text-center text-muted-foreground">
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
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email-2">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forgot-email-2"
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="pl-10 h-11 rounded-lg"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={sendingReset}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              >
                {sendingReset ? "Sending…" : "Send reset link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
