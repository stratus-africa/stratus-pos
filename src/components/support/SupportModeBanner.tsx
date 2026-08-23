import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { endSupportSession, getSupportSession } from "@/lib/supportImpersonation.functions";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "stratuspos_support_session_id";

export function SupportModeBanner() {
  const getSession = useServerFn(getSupportSession);
  const endSession = useServerFn(endSupportSession);
  const [session, setSession] = useState<{
    id: string;
    tenant_name: string;
    super_admin_name: string;
    expires_at: string;
  } | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return;
    getSession({ data: { support_session_id: id } })
      .then(setSession)
      .catch(() => localStorage.removeItem(STORAGE_KEY));
  }, [getSession]);

  if (!session) return null;

  const exit = async () => {
    setEnding(true);
    try {
      await endSession({ data: { support_session_id: session.id } });
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("stratuspos_support_started_at");
      await supabase.auth.signOut();
      window.location.replace("/sign-in");
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="sticky top-0 z-[60] border-b border-amber-300 bg-amber-50 text-amber-950 shadow-sm">
      <div className="mx-auto flex min-h-12 max-w-screen-2xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="h-3.5 w-3.5" /> SUPPORT MODE
            </p>
            <p className="truncate text-xs text-amber-900/75">
              Viewing <strong>{session.tenant_name}</strong> as support on behalf of {session.super_admin_name}.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
          onClick={exit}
          disabled={ending}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          {ending ? "Exiting…" : "Exit Support Mode"}
        </Button>
      </div>
    </div>
  );
}

export default SupportModeBanner;
