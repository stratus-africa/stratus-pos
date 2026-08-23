import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Sparkles } from "lucide-react";
import InstallAppButton from "@/components/pwa/InstallAppButton";

interface Announcement {
  id: string;
  title: string;
  body: string;
  version_label: string | null;
  action_type: "none" | "install_web_app";
  target_all: boolean;
}

/**
 * Shows active platform announcements once per user per announcement.
 */
export default function WhatsNewDialog({ trigger }: { trigger: boolean }) {
  const { user } = useAuth();
  const { business } = useBusiness();
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!trigger || !user) return;
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data: anns } = await (supabase as any)
        .from("system_announcements")
        .select("id, title, body, version_label, starts_at, ends_at, action_type")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(10);
      const candidates = ((anns as any[]) || []).filter(
        (a) => (!a.starts_at || a.starts_at <= nowIso) && (!a.ends_at || a.ends_at >= nowIso),
      );

      const targetedIds = business?.id
        ? new Set(
            (
              ((
                await (supabase as any)
                  .from("announcement_targets")
                  .select("announcement_id")
                  .eq("business_id", business.id)
              ).data as any[]) || []
            ).map((target) => target.announcement_id),
          )
        : new Set<string>();

      const live = candidates.filter((a) => a.target_all !== false || targetedIds.has(a.id));
      if (live.length === 0) return;
      const { data: dismissed } = await (supabase as any)
        .from("announcement_dismissals")
        .select("announcement_id")
        .eq("user_id", user.id);
      const seen = new Set(((dismissed as any[]) || []).map((d) => d.announcement_id));
      const pending = live.filter((a) => !seen.has(a.id));
      if (!cancelled && pending.length > 0) {
        setItems(pending);
        setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trigger, user?.id, business?.id]);

  const close = async () => {
    setOpen(false);
    if (!user || items.length === 0) return;
    await (supabase as any).from("announcement_dismissals").upsert(
      items.map((a) => ({ announcement_id: a.id, user_id: user.id })),
      {
        onConflict: "announcement_id,user_id",
      },
    );
  };

  if (items.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> What's new
          </DialogTitle>
          <DialogDescription>Recent improvements to your system.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          {items.map((a) => (
            <div key={a.id} className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{a.title}</h3>
                {a.version_label && <Badge variant="secondary">{a.version_label}</Badge>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
              {a.action_type === "install_web_app" && (
                <div className="mt-4 rounded-lg bg-muted/40 p-3">
                  <InstallAppButton className="w-full sm:w-auto" icon="smartphone" variant="default">
                    Install StratusPOS
                  </InstallAppButton>
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
