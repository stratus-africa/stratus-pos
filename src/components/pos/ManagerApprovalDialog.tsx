import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApproved: (managerUserId: string) => void;
  title?: string;
  description?: string;
}

interface Manager {
  user_id: string;
  email: string;
  full_name: string | null;
}

export default function ManagerApprovalDialog({ open, onOpenChange, onApproved, title, description }: Props) {
  const { business } = useBusiness();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => { setPassword(""); };

  useEffect(() => {
    if (!open || !business) return;
    (async () => {
      setLoading(true);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("business_id", business.id)
        .in("role", ["admin", "manager", "stores_manager"]);
      const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
      if (!ids.length) { setManagers([]); setLoading(false); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const list: Manager[] = (profs || [])
        .filter((p: any) => !!p.email)
        .map((p: any) => ({ user_id: p.id, email: p.email, full_name: p.full_name }));
      setManagers(list);
      const approver = (business as any)?.pos_manager_approver_id as string | null | undefined;
      const preferred = approver && list.find((m) => m.user_id === approver);
      setSelected(preferred?.user_id || list[0]?.user_id || "");
      setLoading(false);
    })();
  }, [open, business]);

  const handleVerify = async () => {
    const manager = managers.find((m) => m.user_id === selected);
    if (!manager || !password) return;
    setVerifying(true);
    try {
      const url = (import.meta as any).env.VITE_SUPABASE_URL;
      const key = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({ email: manager.email, password }),
      });
      if (!res.ok) {
        toast.error("Invalid manager password");
        return;
      }
      onApproved(manager.user_id);
      reset();
      onOpenChange(false);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {title || "Manager Approval Required"}
          </DialogTitle>
          <DialogDescription>
            {description || "A manager must approve this action. Enter the manager's password."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Manager</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
            ) : managers.length === 0 ? (
              <div className="text-sm text-destructive">No managers found in this business.</div>
            ) : (
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue placeholder="Select a manager" /></SelectTrigger>
                <SelectContent>
                  {managers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Manager Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={verifying}>Cancel</Button>
          <Button onClick={handleVerify} disabled={verifying || !password || !selected}>
            {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
