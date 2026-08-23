import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe2,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  ServerCog,
  Settings2,
  Smartphone,
  WalletCards,
  Webhook,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type IntegrationStatus = "active" | "inactive" | "warning" | "not_configured" | "managed";

type Integration = {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  tone: string;
  status: IntegrationStatus;
  statusLabel: string;
  route?: string;
  external?: string;
  providerKey: string;
};

type IntegrationEvent = {
  id: string;
  provider: string;
  event_type: string | null;
  status: string;
  error_message: string | null;
  external_id: string | null;
  created_at: string;
};

type GlobalSettings = {
  payments?: {
    paystack?: { enabled?: boolean; mode?: string };
    mpesa?: { enabled?: boolean; mode?: string };
  };
};

const INTEGRATION_META = [
  {
    id: "paystack",
    name: "Paystack",
    description: "Cards, bank transfers and mobile money for subscription and tenant payments.",
    icon: WalletCards,
    tone: "sky",
    providerKey: "paystack",
    route: "/super-admin/settings/payments/paystack",
  },
  {
    id: "mpesa",
    name: "M-Pesa",
    description: "Safaricom Daraja STK Push, Till and M-Pesa transaction processing.",
    icon: Smartphone,
    tone: "emerald",
    providerKey: "mpesa",
    route: "/super-admin/settings/payments/mpesa",
  },
  {
    id: "etims",
    name: "eTIMS / Tax",
    description: "Tax and electronic invoicing activity across connected tenant accounts.",
    icon: Globe2,
    tone: "amber",
    providerKey: "etims",
    external: "https://www.kra.go.ke/",
  },
  {
    id: "email",
    name: "Email",
    description: "Transactional email delivery for notifications, receipts and platform messages.",
    icon: Mail,
    tone: "violet",
    providerKey: "email",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "WhatsApp notification and messaging activity when configured for tenants.",
    icon: MessageCircle,
    tone: "green",
    providerKey: "whatsapp",
  },
];

function toneClasses(tone: string) {
  return {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400",
    green: "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400",
  }[tone] || "bg-muted text-muted-foreground";
}

function statusBadge(status: IntegrationStatus) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>;
    case "inactive":
      return <Badge variant="secondary">Inactive</Badge>;
    case "warning":
      return <Badge className="bg-amber-500 hover:bg-amber-500">Needs attention</Badge>;
    case "managed":
      return <Badge variant="outline">Managed</Badge>;
    default:
      return <Badge variant="outline">Not configured</Badge>;
  }
}

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function SuperAdminIntegrations() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<GlobalSettings>({});
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [{ data: global }, { data: eventRows }] = await Promise.all([
        (supabase as any).from("app_settings").select("value").eq("key", "global").maybeSingle(),
        (supabase as any)
          .from("integration_events")
          .select("id,provider,event_type,status,error_message,external_id,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      setSettings((global?.value || {}) as GlobalSettings);
      setEvents((eventRows || []) as IntegrationEvent[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const integrations = useMemo<Integration[]>(() => {
    const paystack = settings.payments?.paystack;
    const mpesa = settings.payments?.mpesa;

    const recentFor = (provider: string) =>
      events.filter((e) => e.provider.toLowerCase() === provider.toLowerCase()).slice(0, 20);

    const eventStatus = (provider: string, configured: boolean): IntegrationStatus => {
      const recent = recentFor(provider);
      const failedRecently = recent.some((e) => ["failed", "error"].includes((e.status || "").toLowerCase()));
      if (failedRecently) return "warning";
      if (configured) return "active";
      if (recent.length) return "managed";
      return "not_configured";
    };

    return INTEGRATION_META.map((meta) => {
      if (meta.id === "paystack") {
        return {
          ...meta,
          status: eventStatus("paystack", !!paystack?.enabled),
          statusLabel: paystack?.mode === "live" ? "Live" : "Test",
        };
      }
      if (meta.id === "mpesa") {
        return {
          ...meta,
          status: eventStatus("mpesa", !!mpesa?.enabled),
          statusLabel: mpesa?.mode === "live" ? "Live" : "Sandbox",
        };
      }
      return {
        ...meta,
        status: eventStatus(meta.providerKey, false),
        statusLabel: recentFor(meta.providerKey).length ? "Activity detected" : "No activity",
      };
    });
  }, [events, settings]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.provider, e.event_type, e.status, e.external_id, e.error_message]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [events, search]);

  const stats = useMemo(() => {
    const active = integrations.filter((i) => i.status === "active" || i.status === "managed").length;
    const attention = integrations.filter((i) => i.status === "warning").length;
    const successful = events.filter((e) => ["success", "successful", "completed"].includes(e.status.toLowerCase())).length;
    const failed = events.filter((e) => ["failed", "error"].includes(e.status.toLowerCase())).length;
    return { active, attention, successful, failed };
  }, [events, integrations]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations Manager</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage platform integrations, open provider configuration, and monitor integration activity from one place.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
          <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ServerCog} label="Connected / Managed" value={stats.active} />
        <StatCard icon={AlertCircle} label="Needs Attention" value={stats.attention} />
        <StatCard icon={CheckCircle2} label="Successful Events" value={stats.successful} />
        <StatCard icon={XCircle} label="Failed Events" value={stats.failed} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Platform Integrations</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Payment gateways are configured here; other providers show platform-wide activity when available.
              </p>
            </div>
            <Badge variant="outline">{integrations.length} integrations</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <div key={integration.id} className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20">
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneClasses(integration.tone))}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{integration.name}</h3>
                      {statusBadge(integration.status)}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{integration.description}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">{integration.statusLabel}</span>
                      {integration.route ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={integration.route}>
                            <Settings2 className="mr-2 h-3.5 w-3.5" /> Configure
                          </Link>
                        </Button>
                      ) : integration.external ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={integration.external} target="_blank" rel="noreferrer">
                            Provider <ExternalLink className="ml-2 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled>
                          Activity only
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" /> Integration Activity
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Latest webhook and provider events recorded by the platform.</p>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search provider, event or reference..."
              className="w-full md:w-80"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Webhook className="mx-auto mb-2 h-5 w-5" />
              No integration events found.
            </div>
          ) : (
            <div className="divide-y">
              {filteredEvents.slice(0, 50).map((event) => {
                const ok = ["success", "successful", "completed"].includes(event.status.toLowerCase());
                const failed = ["failed", "error"].includes(event.status.toLowerCase());
                return (
                  <div key={event.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center">
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      ok ? "bg-emerald-50 text-emerald-600" : failed ? "bg-red-50 text-red-600" : "bg-muted text-muted-foreground",
                    )}>
                      {ok ? <CheckCircle2 className="h-4 w-4" /> : failed ? <XCircle className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium capitalize">{event.provider}</span>
                        <Badge variant="outline" className="text-[10px]">{event.status}</Badge>
                        {event.event_type && <span className="text-xs text-muted-foreground">{event.event_type}</span>}
                      </div>
                      {event.error_message && <p className="mt-0.5 truncate text-xs text-destructive">{event.error_message}</p>}
                    </div>
                    <div className="text-left text-xs text-muted-foreground sm:text-right">
                      <div>{formatTime(event.created_at)}</div>
                      {event.external_id && <div className="font-mono text-[10px]">{event.external_id}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowRight className="h-3.5 w-3.5" />
        <span>Provider secrets remain server-side; this manager only exposes safe configuration/status controls.</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
