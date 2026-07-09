import { useEffect, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  business_id: string | null;
  metadata: any;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as Notification[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
  };

  const unread = items.filter((i) => !i.read_at).length;

  return { items, unread, loading, markRead, markAllRead, clearAll, remove, reload: load };
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { items, unread, markRead, markAllRead } = useNotifications();

  const preview = items.slice(0, 8);

  const onClick = async (n: Notification) => {
    if (!n.read_at) await markRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-foreground/60 border border-border relative"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={markAllRead}>
              <CheckCheck className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {preview.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            You're all caught up
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {preview.map((n) => (
              <button
                key={n.id}
                onClick={() => onClick(n)}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-muted/60 flex items-start gap-2 border-b border-border/40 last:border-0 transition-colors",
                  !n.read_at && "bg-primary/[0.03]"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 rounded-full shrink-0",
                    !n.read_at ? "bg-primary" : "bg-transparent"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{n.title}</div>
                  {n.message && (
                    <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {n.message}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <DropdownMenuSeparator className="m-0" />
        <button
          onClick={() => navigate("/notifications")}
          className="w-full text-center text-xs text-primary hover:bg-muted/60 py-2 font-medium"
        >
          View all notifications
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
