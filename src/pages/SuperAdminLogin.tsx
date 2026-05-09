import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield, Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, Info, Copy, Check,
} from "lucide-react";

export default function SuperAdminLogin() {
  const { user, loading, signIn } = useAuth();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

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

  if (!loading && !saLoading && user && isSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  const copy = async (val: string, which: "email" | "password") => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error.message);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Left: green gradient panel */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white">
        {/* Decorative blobs */}
        <div className="absolute -top-32 -left-32 w-[450px] h-[450px] rounded-full bg-white/15 blur-2xl" aria-hidden />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="absolute top-[55%] right-[28%] w-32 h-32 rounded-full bg-white/10" aria-hidden />
        <div className="absolute bottom-[18%] left-[25%] w-24 h-24 rounded-3xl bg-white/10" aria-hidden />

        <div />

        <div className="relative max-w-md">
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-8 shadow-md">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight tracking-tight mb-5">
            Manage your entire platform from one place
          </h1>
          <p className="text-white/85 leading-relaxed mb-10 text-base">
            Access tenant management, billing, subscriptions, and analytics through the super admin dashboard.
          </p>

          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/25">
            <div>
              <div className="text-3xl font-bold">100%</div>
              <div className="text-[11px] uppercase tracking-wider text-white/75 mt-1 font-medium">Secure</div>
            </div>
            <div>
              <div className="text-3xl font-bold">24/7</div>
              <div className="text-[11px] uppercase tracking-wider text-white/75 mt-1 font-medium">Access</div>
            </div>
            <div>
              <div className="text-3xl font-bold">Real-time</div>
              <div className="text-[11px] uppercase tracking-wider text-white/75 mt-1 font-medium">Analytics</div>
            </div>
          </div>
        </div>

        <div className="relative" />
      </aside>

      {/* Right: login form */}
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-7">
          {/* Mobile back link */}
          <Link to="/landing" className="lg:hidden inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-500/20">
              $
            </div>
            <span className="text-2xl font-bold tracking-tight">StratusPOS</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Welcome back</h2>
            <p className="text-muted-foreground text-sm">
              Sign in to the super admin dashboard to manage your platform.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sa-email" className="text-sm font-medium">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                <Input
                  id="sa-email"
                  type="email"
                  placeholder="Enter Your Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 rounded-lg border-emerald-300 focus-visible:ring-emerald-400 focus-visible:ring-offset-0"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sa-password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="sa-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 rounded-lg focus-visible:ring-emerald-400 focus-visible:ring-offset-0"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-semibold shadow-md shadow-emerald-500/20"
            >
              {submitting ? "Signing in..." : (<>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>)}
            </Button>
          </form>

          {/* Demo credentials box */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-indigo-600">
              <Info className="h-3.5 w-3.5" />
              Demo Login Access
            </div>
            <div className="space-y-1.5">
              <DemoRow
                label="Email"
                value="superadmin@stratuspos.site"
                onCopy={() => copy("superadmin@stratuspos.site", "email")}
                copied={copied === "email"}
              />
              <DemoRow
                label="Password"
                value="123456"
                onCopy={() => copy("123456", "password")}
                copied={copied === "password"}
              />
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-white px-3 text-muted-foreground">or</span>
            </div>
          </div>

          <Button asChild variant="outline" className="w-full h-11 rounded-lg font-medium">
            <Link to="/landing"><ArrowLeft className="mr-2 h-4 w-4" /> Back to homepage</Link>
          </Button>

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
              <Label htmlFor="forgot-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forgot-email"
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
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                Cancel
              </Button>
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

function DemoRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-semibold text-indigo-700">{label}</span>
      <div className="flex items-center gap-1.5">
        <code className="font-mono text-indigo-900/80 text-[12px]">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          className="h-6 w-6 rounded-md flex items-center justify-center text-indigo-500 hover:bg-indigo-100"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
