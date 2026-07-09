import { useNavigate } from "react-router-dom";
import { useNotifications, Notification } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "offline_payment", label: "Payments" },
  { key: "subscription", label: "Subscriptions" },
] as const;

export default function Notifications() {
  const navigate = useNavigate();
  const { items, unread, markRead, markAllRead, clearAll, remove } = useNotifications();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const filtered = items.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read_at;
    return n.type.startsWith(filter);
  });

  const onOpen = async (n: Notification) => {
    if (!n.read_at) await markRead(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "All caught up"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={unread === 0}
            className="gap-1.5"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            disabled={items.length === 0}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Clear all
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="divide-y divide-border/60 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group",
                !n.read_at && "bg-primary/[0.03]"
              )}
            >
              <button
                onClick={() => onOpen(n)}
                className="flex-1 min-w-0 text-left flex items-start gap-3"
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 rounded-full shrink-0",
                    !n.read_at ? "bg-primary" : "bg-transparent border border-border"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{n.title}</span>
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      {n.type.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {n.message && (
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {format(new Date(n.created_at), "PPp")} ·{" "}
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!n.read_at && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Mark as read"
                    onClick={() => markRead(n.id)}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  title="Delete"
                  onClick={() => remove(n.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
