import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export function SetupWizardReminder() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("onboarding_drafts")
        .select("current_step, completed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active || error || !data || data.completed_at) return;
      setStep(Math.min(7, Math.max(1, Number(data.current_step || 1))));
      setShow(true);
    })();
    return () => { active = false; };
  }, [user?.id]);

  if (!show) return null;

  const percentage = Math.round(((step - 1) / 7) * 100);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="h-10 w-10 shrink-0 rounded-full bg-white text-emerald-600 flex items-center justify-center border border-emerald-100">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <p className="font-semibold text-emerald-950">Complete your StratusPOS setup</p>
            <p className="text-sm text-emerald-800">You’re on step {step} of 7. Finish the wizard to configure your workspace.</p>
          </div>
          <span className="text-xs font-medium text-emerald-700">{percentage}% complete</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.max(8, percentage)}%` }} />
        </div>
      </div>
      <Button asChild className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white">
        <Link to="/onboarding">Continue setup <ArrowRight className="ml-2 h-4 w-4" /></Link>
      </Button>
    </div>
  );
}
