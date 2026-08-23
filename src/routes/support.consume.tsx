import { useEffect, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/support/consume")({
  component: SupportConsume,
});

function SupportConsume() {
  const search = useSearch({ from: "/support/consume" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const consume = async () => {
      const tokenHash = String((search as any).token_hash || "");
      const sessionId = String((search as any).support_session_id || "");
      if (!tokenHash || !sessionId) { setError("Invalid support link"); return; }

      const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (otpError) { setError(otpError.message); return; }

      localStorage.setItem("stratuspos_support_session_id", sessionId);
      localStorage.setItem("stratuspos_support_started_at", new Date().toISOString());
      window.location.replace("/");
    };
    void consume();
  }, [search]);

  if (error) {
    return <div className="min-h-screen flex items-center justify-center p-6"><div className="max-w-md text-center"><ShieldCheck className="mx-auto mb-4 h-10 w-10 text-destructive" /><h1 className="text-xl font-semibold">Support session could not start</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></div></div>;
  }

  return <div className="min-h-screen flex items-center justify-center p-6"><div className="text-center"><Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" /><p className="font-medium">Starting secure support mode…</p><p className="mt-1 text-sm text-muted-foreground">Please wait.</p></div></div>;
}
