import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { superAdminMutation } from "@/lib/superAdminMutations.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2, Megaphone, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

interface Announcement {
  id: string;
  title: string;
  body: string;
  version_label: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  schedule_timezone: string;
  created_at: string;
  action_type: "none" | "install_web_app";
}

type Draft = {
  id?: string;
  title: string;
  body: string;
  version_label: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  schedule_timezone: string;
  action_type: "none" | "install_web_app";
};

const empty = (): Draft => ({
  title: "",
  body: "",
  version_label: "",
  is_active: true,
  starts_at: "",
  ends_at: "",
  schedule_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  action_type: "none",
});
const timezones =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC", "Africa/Nairobi", "Europe/London", "America/New_York"];
const toLocalInput = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(new Date(iso))
        .replace(" ", "T")
    : "";
const zonedToUtc = (local: string, timezone: string) => {
  if (!local) return null;
  const target = new Date(`${local}:00Z`);
  const offset = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .reduce<Record<string, string>>((out, part) => ({ ...out, [part.type]: part.value }), {});
    return (
      Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - date.getTime()
    );
  };
  let utc = new Date(target.getTime() - offset(target));
  utc = new Date(target.getTime() - offset(utc));
  return utc.toISOString();
};
const displayInZone = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(
        new Date(iso),
      )
    : "No limit";

export default function SuperAdminAnnouncements() {
  const mutate = useServerFn(superAdminMutation);
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty());
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState<{ id: string; name: string; timezone: string | null }[]>([]);
  const [previewTenantId, setPreviewTenantId] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("system_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Announcement[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    void (async () => {
      const { data } = await (supabase as any).from("businesses").select("id, name, timezone").order("name");
      setTenants(data || []);
    })();
  }, []);

  const save = async () => {
    if (!draft.title.trim() || !draft.body.trim()) {
      toast.error("Title and message are required");
      return;
    }
    setSaving(true);
    const payload = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      version_label: draft.version_label.trim() || null,
      is_active: draft.is_active,
      starts_at: zonedToUtc(draft.starts_at, draft.schedule_timezone) || new Date().toISOString(),
      ends_at: zonedToUtc(draft.ends_at, draft.schedule_timezone),
      target_all: true,
      schedule_timezone: draft.schedule_timezone,
      action_type: draft.action_type,
    };
    try {
      await mutate({ data: { action: "save_announcement", id: draft.id || null, payload } });
    } catch (error: any) {
      setSaving(false);
      toast.error(error?.message || "Failed to save announcement");
      return;
    }
    setSaving(false);
    toast.success(draft.id ? "Announcement updated" : "Announcement published");
    setOpen(false);
    void load();
  };

  const toggleActive = async (row: Announcement) => {
    try { await mutate({ data: { action: "toggle_announcement", id: row.id, is_active: !row.is_active } }); } catch (error: any) { return toast.error(error?.message || "Failed to update announcement"); }
    void load();
  };

  const remove = async (row: Announcement) => {
    if (!confirm(`Delete announcement "${row.title}"?`)) return;
    try { await mutate({ data: { action: "delete_announcement", id: row.id } }); } catch (error: any) { return toast.error(error?.message || "Failed to delete announcement"); }
    toast.success("Announcement deleted");
    void load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">Push "What's new" messages that tenants see at start of day.</p>
        </div>
        <Button
          onClick={() => {
            setDraft(empty());
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New announcement
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-emerald-500" /> Published announcements
          </CardTitle>
          <CardDescription>Only active announcements within their schedule are shown to users.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No announcements yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, i) => (
                    <TableRow key={row.id} className={i % 2 ? "bg-muted/30" : ""}>
                      <TableCell className="max-w-[240px]">
                        <p className="truncate font-medium">{row.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.body}</p>
                      </TableCell>
                      <TableCell>{row.version_label || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.starts_at ? format(new Date(row.starts_at), "dd MMM yyyy HH:mm") : "Always"}
                        {" → "}
                        {row.ends_at ? format(new Date(row.ends_at), "dd MMM yyyy") : "No end"}
                      </TableCell>
                      <TableCell>
                        {row.action_type === "install_web_app" ? (
                          <Badge variant="outline">Install Web App</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? "default" : "secondary"}>
                          {row.is_active ? "Active" : "Hidden"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setDraft({
                                  id: row.id,
                                  title: row.title,
                                  body: row.body,
                                  version_label: row.version_label || "",
                                  is_active: row.is_active,
                                  starts_at: toLocalInput(row.starts_at, row.schedule_timezone || "UTC"),
                                  ends_at: toLocalInput(row.ends_at, row.schedule_timezone || "UTC"),
                                  schedule_timezone: row.schedule_timezone || "UTC",
                                  action_type: row.action_type || "none",
                                });
                                setOpen(true);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive(row)}>
                              {row.is_active ? "Hide from tenants" : "Show to tenants"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => remove(row)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit announcement" : "New announcement"}</DialogTitle>
            <DialogDescription>Tenants see this once at start of day until they dismiss it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="New stock take workflow"
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                rows={5}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Describe the improvements…"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Announcement action</Label>
                <Select
                  value={draft.action_type}
                  onValueChange={(action_type: Draft["action_type"]) => setDraft({ ...draft, action_type })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="install_web_app">Install Web App</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Shows the native PWA install prompt when supported, or device-specific installation instructions.
                </p>
              </div>
              <div>
                <Label>Version label (optional)</Label>
                <Input
                  value={draft.version_label}
                  onChange={(e) => setDraft({ ...draft, version_label: e.target.value })}
                  placeholder="v2.4"
                />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                <span className="text-sm">Show to tenants</span>
              </div>
              <div>
                <Label>Show from (optional)</Label>
                <Input
                  type="datetime-local"
                  value={draft.starts_at}
                  onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Show until (optional)</Label>
                <Input
                  type="datetime-local"
                  value={draft.ends_at}
                  onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Schedule timezone</Label>
                <Select
                  value={draft.schedule_timezone}
                  onValueChange={(schedule_timezone) => setDraft({ ...draft, schedule_timezone })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((timezone) => (
                      <SelectItem key={timezone} value={timezone}>
                        {timezone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Eye className="h-4 w-4" /> Tenant preview
              </div>
              <Select value={previewTenantId} onValueChange={setPreviewTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a tenant to preview their local time" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.timezone || "UTC"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {previewTenantId &&
                (() => {
                  const tenant = tenants.find((item) => item.id === previewTenantId);
                  const zone = tenant?.timezone || "UTC";
                  return (
                    <p className="mt-2 text-muted-foreground">
                      {tenant?.name} sees it from{" "}
                      <strong>{displayInZone(zonedToUtc(draft.starts_at, draft.schedule_timezone), zone)}</strong> until{" "}
                      <strong>{displayInZone(zonedToUtc(draft.ends_at, draft.schedule_timezone), zone)}</strong>.
                    </p>
                  );
                })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
