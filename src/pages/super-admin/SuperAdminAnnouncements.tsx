import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2, Megaphone } from "lucide-react";
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
  created_at: string;
}

type Draft = {
  id?: string;
  title: string;
  body: string;
  version_label: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

const empty = (): Draft => ({ title: "", body: "", version_label: "", is_active: true, starts_at: "", ends_at: "" });
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export default function SuperAdminAnnouncements() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty());
  const [saving, setSaving] = useState(false);

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
      starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null,
      ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
    };
    const { error } = draft.id
      ? await (supabase as any).from("system_announcements").update(payload).eq("id", draft.id)
      : await (supabase as any).from("system_announcements").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(draft.id ? "Announcement updated" : "Announcement published");
    setOpen(false);
    void load();
  };

  const toggleActive = async (row: Announcement) => {
    const { error } = await (supabase as any)
      .from("system_announcements")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const remove = async (row: Announcement) => {
    if (!confirm(`Delete announcement "${row.title}"?`)) return;
    const { error } = await (supabase as any).from("system_announcements").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Announcement deleted");
    void load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Push "What's new" messages that tenants see at start of day.
          </p>
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
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
                        {row.starts_at ? format(new Date(row.starts_at), "dd MMM yyyy") : "Always"}
                        {" → "}
                        {row.ends_at ? format(new Date(row.ends_at), "dd MMM yyyy") : "No end"}
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
                                  starts_at: toLocalInput(row.starts_at),
                                  ends_at: toLocalInput(row.ends_at),
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
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="New stock take workflow" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={5} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Describe the improvements…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Version label (optional)</Label>
                <Input value={draft.version_label} onChange={(e) => setDraft({ ...draft, version_label: e.target.value })} placeholder="v2.4" />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                <span className="text-sm">Show to tenants</span>
              </div>
              <div>
                <Label>Show from (optional)</Label>
                <Input type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
              </div>
              <div>
                <Label>Show until (optional)</Label>
                <Input type="datetime-local" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
