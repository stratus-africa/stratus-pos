import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Receipt, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { format } from "date-fns";

export interface CreditSaleSummary {
  id: string;
  invoice_number: string | null;
  total: number;
  created_at: string;
  customer_id: string;
  customer_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The customer whose credit sales to show */
  customerId: string;
  customerName: string;
  /** Called when the cashier picks a credit sale to settle */
  onSettle: (sale: CreditSaleSummary) => void;
}

export default function CustomerCreditLedgerDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  onSettle,
}: Props) {
  const { business } = useBusiness();
  const [settling, setSettling] = useState<string | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["credit_sales", business?.id, customerId],
    queryFn: async () => {
      if (!business?.id || !customerId) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_number, total, created_at, customer_id")
        .eq("business_id", business.id)
        .eq("customer_id", customerId)
        .eq("payment_status", "credit")
        .eq("status", "final")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        customer_name: customerName,
      })) as CreditSaleSummary[];
    },
    enabled: open && !!business?.id && !!customerId,
  });

  const totalOwed = sales.reduce((s, r) => s + Number(r.total), 0);

  const handleSettle = (sale: CreditSaleSummary) => {
    setSettling(sale.id);
    onSettle(sale);
    onOpenChange(false);
    setSettling(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Credit balance — {customerName}
          </DialogTitle>
          <DialogDescription>
            Select a credit sale to load into the cart and record payment.
          </DialogDescription>
        </DialogHeader>

        {/* Summary bar */}
        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {sales.length} open credit sale{sales.length !== 1 ? "s" : ""}
          </span>
          <span className="text-base font-bold">
            KES {totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} owed
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sales.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No open credit sales for this customer.
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <div className="divide-y">
              {sales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between gap-3 px-1 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {sale.invoice_number ?? "—"}
                      </span>
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
                    <Button
                      size="sm"
                      disabled={settling === sale.id}
                      onClick={() => handleSettle(sale)}
                    >
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

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
