import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, UserPlus, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useQueryClient } from "@tanstack/react-query";

export interface CreditCustomerOption {
  id: string;
  name: string;
  phone?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CreditCustomerOption[];
  onSelected: (customer: CreditCustomerOption) => void;
}

export default function CreditCustomerDialog({ open, onOpenChange, customers, onSelected }: Props) {
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return customers.slice(0, 100);
    return customers
      .filter((c) => `${c.name} ${c.phone || ""}`.toLowerCase().includes(s))
      .slice(0, 100);
  }, [customers, search]);

  const reset = () => {
    setMode("existing");
    setSearch("");
    setName("");
    setPhone("");
    setEmail("");
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const pick = (c: CreditCustomerOption) => {
    onSelected(c);
    reset();
    onOpenChange(false);
  };

  const createCustomer = async () => {
    if (!business) return;
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!phone.trim()) {
      toast.error("Phone number is required for credit sales");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          business_id: business.id,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
        })
        .select("id, name, phone")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
      pick(data as CreditCustomerOption);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Credit Sale — select customer</DialogTitle>
          <DialogDescription>
            Credit sales must be linked to a customer. Choose an existing one or create a new customer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("existing")}
          >
            <Users className="h-4 w-4 mr-1" /> Existing
          </Button>
          <Button
            type="button"
            variant={mode === "new" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("new")}
          >
            <UserPlus className="h-4 w-4 mr-1" /> New customer
          </Button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Search by name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="h-64 rounded-md border">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No customers found.
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={() => { setName(search); setMode("new"); }}>
                      <UserPlus className="h-4 w-4 mr-1" /> Create new customer
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                      onClick={() => pick(c)}
                    >
                      <div className="text-sm font-medium">{c.name}</div>
                      {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="credit-cust-name">Name *</Label>
              <Input id="credit-cust-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="credit-cust-phone">Phone *</Label>
              <Input id="credit-cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="credit-cust-email">Email</Label>
              <Input id="credit-cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          {mode === "new" && (
            <Button onClick={createCustomer} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create &amp; continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
