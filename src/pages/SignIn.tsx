import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, CheckCircle2, TrendingUp, ShoppingBag, Folder } from "lucide-react";

const HIGHLIGHTS = [
  "Lightning fast checkout in under 3 seconds",
  "Real-time analytics for every store",
  "Bank-grade security & role-based access",
];

export default function SignIn() {
  const navigate = useNavigate();
  const { user, loading, signIn } = useAuth();
  const { needsOnboarding, loading: bizLoading } = useBusiness();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  if (!loading && user && !bizLoading && !saLoading) {
    if (isSuperAdmin) return <Navigate to="/super-admin" replace />;
    if (needsOnboarding) return <Navigate to="/onboarding" replace />;
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back!");
    // Don't manually navigate — the route guard above will redirect
    // once the auth + business contexts finish loading.
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
      <aside className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white bg-[radial-gradient(ellipse_at_top_right,_#3b4ed1_0%,_#1a2270_45%,_#0b1140_100%)]">
        {/* top gradient hairline */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" aria-hidden />
        {/* glow accents */}
        <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full bg-indigo-400/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-32 w-[520px] h-[520px] rounded-full bg-blue-500/15 blur-3xl" aria-hidden />
        {/* sparkles */}
        <div className="absolute top-24 right-40 w-1.5 h-1.5 rounded-full bg-white/60" aria-hidden />
        <div className="absolute top-1/2 left-16 w-1 h-1 rounded-full bg-white/40" aria-hidden />
        <div className="absolute bottom-40 right-24 w-1 h-1 rounded-full bg-white/50" aria-hidden />

        {/* header */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-5">
            <h1 className="text-5xl font-extrabold tracking-tight">StratusPOS</h1>
            <span className="px-3 py-1 rounded-full text-[10px] font-semibold tracking-[0.18em] uppercase bg-white/10 border border-white/15 backdrop-blur-sm">
              Premium POS
            </span>
          </div>
          <p className="text-white/70 leading-relaxed max-w-md text-[15px]">
            One workspace for sales, inventory, customers and reporting — designed to feel effortless on every device.
          </p>
        </div>

        {/* illustration */}
        <div className="relative flex-1 flex items-center justify-center my-8">
          <div className="relative w-[420px] h-[360px]">
            {/* sparkles */}
            <div className="absolute top-20 left-20 text-white/80 text-sm" aria-hidden>✦</div>
            <div className="absolute top-28 right-10 text-white/60 text-xs" aria-hidden>✦</div>
            <div className="absolute bottom-24 left-6 text-white/40 text-xs" aria-hidden>✦</div>
            <div className="absolute bottom-12 right-2 text-white/50 text-sm" aria-hidden>✦</div>

            {/* floating: Today's Sales (upper-left, overlapping roof) */}
            <div className="absolute top-6 -left-2 z-30 bg-white rounded-2xl pl-3 pr-5 py-2.5 shadow-2xl flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-white" />
              </span>
              <div className="text-slate-900 leading-tight">
                <div className="text-[11px] text-slate-500">Today's Sales</div>
                <div className="text-sm font-bold">KES 2,847</div>
              </div>
            </div>

            {/* StratusPOS sign on roof */}
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-white rounded-md px-3 py-1.5 shadow-lg">
              <span className="text-[11px] font-bold text-slate-900 tracking-tight">StratusPOS</span>
            </div>

            {/* roof */}
            <div className="absolute top-[72px] left-1/2 -translate-x-1/2 w-[360px] h-14 bg-gradient-to-b from-sky-400 to-blue-500 [clip-path:polygon(7%_100%,_93%_100%,_100%_0,_0_0)] shadow-lg" aria-hidden />
            <div className="absolute top-[72px] left-1/2 -translate-x-1/2 w-[360px] h-14 opacity-30 [clip-path:polygon(7%_100%,_93%_100%,_100%_0,_0_0)]" style={{ backgroundImage: "repeating-linear-gradient(110deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 20px)" }} aria-hidden />

            {/* body */}
            <div className="absolute top-[126px] left-1/2 -translate-x-1/2 w-[340px] h-[220px] rounded-b-xl bg-gradient-to-b from-white/12 to-white/[0.04] backdrop-blur-sm border border-white/15 overflow-hidden">
              {/* shelves row 1 */}
              <div className="absolute top-6 left-6 flex gap-2.5">
                <div className="h-7 w-10 rounded bg-blue-400/80" />
                <div className="h-7 w-9 rounded bg-indigo-300/70" />
                <div className="h-7 w-7 rounded bg-white/80" />
                <div className="h-7 w-10 rounded bg-cyan-300/80" />
              </div>
              {/* shelves row 2 */}
              <div className="absolute top-[68px] left-6 flex gap-2.5 items-center">
                <div className="h-7 w-9 rounded bg-indigo-400/80" />
                <div className="h-7 w-7 rounded-full bg-cyan-300/80" />
                <div className="h-7 w-10 rounded bg-blue-300/70" />
              </div>

              {/* counter base */}
              <div className="absolute bottom-0 left-0 right-0 h-14 bg-white/90" />

              {/* clerk (left) */}
              <div className="absolute bottom-3 left-12 flex flex-col items-center z-10">
                <div className="relative h-7 w-7 rounded-full bg-amber-200 border border-amber-300">
                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-1 border-b-2 border-slate-700 rounded-b-full" />
                  <div className="absolute top-2 left-1.5 w-0.5 h-0.5 rounded-full bg-slate-800" />
                  <div className="absolute top-2 right-1.5 w-0.5 h-0.5 rounded-full bg-slate-800" />
                </div>
                <div className="relative h-12 w-10 -mt-1 rounded-t-md bg-sky-500">
                  {/* pointing arm */}
                  <div className="absolute -right-5 top-1.5 w-8 h-1.5 bg-sky-500 rotate-[-20deg] origin-left rounded-full" />
                </div>
              </div>

              {/* monitor with cyan screen */}
              <div className="absolute bottom-10 left-[130px] z-20">
                <div className="h-10 w-14 rounded-md bg-slate-800 border border-slate-700 p-1.5 shadow-lg">
                  <div className="h-1 w-8 rounded bg-cyan-300 mb-1" />
                  <div className="h-1 w-6 rounded bg-cyan-300/70" />
                </div>
              </div>

              {/* till behind monitor */}
              <div className="absolute bottom-10 left-[188px] z-10 h-10 w-12 rounded-md bg-slate-700 border border-slate-600" />

              {/* customer (right) */}
              <div className="absolute bottom-3 right-12 flex flex-col items-center z-10">
                <div className="h-6 w-6 rounded-full bg-amber-200 border border-amber-300" />
                <div className="h-11 w-9 -mt-1 rounded-t-md bg-indigo-500" />
              </div>
            </div>

            {/* shadow under shop */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-72 h-3 rounded-full bg-black/40 blur-md" aria-hidden />

            {/* floating: Orders (lower-right) */}
            <div className="absolute -bottom-2 right-0 z-30 bg-white rounded-2xl pl-3 pr-6 py-2.5 shadow-2xl flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
                <ShoppingBag className="h-4 w-4 text-white" />
              </span>
              <div className="text-slate-900 leading-tight">
                <div className="text-[11px] text-slate-500">Orders</div>
                <div className="text-sm font-bold">142</div>
              </div>
            </div>
          </div>
        </div>




        {/* highlights */}
        <ul className="relative space-y-3.5">
          {HIGHLIGHTS.map(h => (
            <li key={h} className="flex items-center gap-3">
              <span className="h-6 w-6 rounded-full bg-cyan-400/20 border border-cyan-300/40 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-cyan-200" />
              </span>
              <span className="text-[13px] text-white/85 font-medium">{h}</span>
            </li>
          ))}
        </ul>
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
