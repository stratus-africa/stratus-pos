import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, UserPlus, Users, Loader2, CreditCard, ArrowLeft, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CreditSaleSummary } from "@/components/pos/CustomerCreditLedgerDialog";

export interface CreditCustomerOption {
  id: string;
  name: string;
  phone?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: CreditCustomerOption[];
  /**
   * "new_credit"  — pick/create a customer then call onSelected (save credit sale)
   * "view_credits" — pick a customer then show their open credit sales; call onSettle on pick
   */
  intent?: "new_credit" | "view_credits";
  /** Called in "new_credit" mode after a customer is chosen */
  onSelected?: (customer: CreditCustomerOption) => void;
  /** Called in "view_credits" mode after a credit sale is chosen to pay */
  onSettle?: (customer: CreditCustomerOption, sale: CreditSaleSummary) => void;
}

type Screen = "pick_customer" | "new_customer" | "credit_ledger";

export default function CreditCustomerDialog({
  open,
  onOpenChange,
  customers,
  intent = "new_credit",
  onSelected,
  onSettle,
}: Props) {
  const { business } = useBusiness();
  const qc = useQueryClient();

  // --- screen state ---
  const [screen, setScreen] = useState<Screen>("pick_customer");
  const [search, setSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<CreditCustomerOption | null>(null);

  // new-customer form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // credit ledger
  const [settling, setSettling] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return customers.slice(0, 100);
    return customers.filter((c) => `${c.name} ${c.phone || ""}`.toLowerCase().includes(s)).slice(0, 100);
  }, [customers, search]);

  const { data: creditSales = [], isLoading: loadingCredits } = useQuery({
    queryKey: ["credit_sales", business?.id, pickedCustomer?.id],
    queryFn: async () => {
      if (!business?.id || !pickedCustomer?.id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_number, total, created_at, customer_id")
        .eq("business_id", business.id)
        .eq("customer_id", pickedCustomer.id)
        .eq("payment_status", "credit")
        .eq("status", "final")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        customer_name: pickedCustomer.name,
      })) as CreditSaleSummary[];
    },
    enabled: screen === "credit_ledger" && !!business?.id && !!pickedCustomer?.id,
  });

  const totalOwed = creditSales.reduce((s, r) => s + Number(r.total), 0);

  // -------------------------------------------------------------------------
  const reset = () => {
    setScreen("pick_customer");
    setSearch("");
    setPickedCustomer(null);
    setName("");
    setPhone("");
    setEmail("");
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const pickCustomer = (c: CreditCustomerOption) => {
    if (intent === "view_credits") {
      setPickedCustomer(c);
      setScreen("credit_ledger");
    } else {
      // new_credit: hand off immediately
      onSelected?.(c);
      reset();
      onOpenChange(false);
    }
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
        .insert({ business_id: business.id, name: name.trim(), phone: phone.trim(), email: email.trim() || null })
        .select("id, name, phone")
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
      pickCustomer(data as CreditCustomerOption);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create customer");
    } finally {
      setSaving(false);
    }
  };

  const handleSettle = (sale: CreditSaleSummary) => {
    if (!pickedCustomer) return;
    setSettling(sale.id);
    onSettle?.(pickedCustomer, sale);
    reset();
    onOpenChange(false);
    setSettling(null);
  };

  // -------------------------------------------------------------------------
  // Titles / descriptions per screen
  const titles: Record<Screen, string> = {
    pick_customer: intent === "view_credits" ? "View credit sales" : "Credit sale — select customer",
    new_customer: "Create new customer",
    credit_ledger: `Credit balance — ${pickedCustomer?.name ?? ""}`,
  };
  const descriptions: Record<Screen, string> = {
    pick_customer:
      intent === "view_credits"
        ? "Select a customer to see their outstanding credit sales."
        : "Credit sales must be linked to a customer. Choose an existing one or create a new customer.",
    new_customer: "Fill in the details below. A phone number is required for credit sales.",
    credit_ledger: "Select a credit sale to load into the cart and record payment.",
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {screen === "credit_ledger" && (
              <button
                type="button"
                onClick={() => setScreen("pick_customer")}
                className="mr-1 rounded p-0.5 hover:bg-muted"
                aria-label="Back to customer list"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {screen === "credit_ledger" ? <CreditCard className="h-5 w-5" /> : null}
            {titles[screen]}
          </DialogTitle>
          <DialogDescription>{descriptions[screen]}</DialogDescription>
        </DialogHeader>

        {/* ── Screen: pick_customer ── */}
        {screen === "pick_customer" && (
          <>
            {intent === "new_credit" && (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="default" size="sm" onClick={() => setScreen("pick_customer")}>
                  <Users className="h-4 w-4 mr-1" /> Existing
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setScreen("new_customer")}>
                  <UserPlus className="h-4 w-4 mr-1" /> New customer
                </Button>
              </div>
            )}

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
                    {intent === "new_credit" && (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setName(search);
                            setScreen("new_customer");
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-1" /> Create new customer
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="divide-y">
                    {filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                        onClick={() => pickCustomer(c)}
                      >
                        <div className="text-sm font-medium">{c.name}</div>
                        {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Screen: new_customer ── */}
        {screen === "new_customer" && (
          <>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="cc-name">Name *</Label>
                <Input
                  id="cc-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-phone">Phone *</Label>
                <Input
                  id="cc-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-email">Email</Label>
                <Input
                  id="cc-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScreen("pick_customer")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={createCustomer} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Create &amp; continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Screen: credit_ledger ── */}
        {screen === "credit_ledger" && (
          <>
            {/* Summary bar */}
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {creditSales.length} open credit sale{creditSales.length !== 1 ? "s" : ""}
              </span>
              <span className="font-bold">
                KES {totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} owed
              </span>
            </div>

            {loadingCredits ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : creditSales.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No open credit sales for this customer.
              </div>
            ) : (
              <ScrollArea className="max-h-[40vh]">
                <div className="divide-y">
                  {creditSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between gap-3 px-1 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium text-sm">{sale.invoice_number ?? "—"}</span>
                          <Badge variant="outline" className="text-amber-600 border-amber-400 text-[10px]">
                            Unpaid
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                          {format(new Date(sale.created_at), "dd MMM yyyy, HH:mm")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-semibold tabular-nums text-sm">
                          KES {Number(sale.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <Button size="sm" disabled={settling === sale.id} onClick={() => handleSettle(sale)}>
                          {settling === sale.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <CreditCard className="h-3.5 w-3.5 mr-1" />
                          )}
                          Pay
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
