import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAccountMappings } from "@/hooks/useAccountMappings";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildInvoiceVatLines } from "@/lib/vatJournal";
import { assertCanPost } from "@/lib/postingGuard";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { toast } from "sonner";

export function VatJournalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { business } = useBusiness();
  const { mappings, accounts } = useAccountMappings();
  const qc = useQueryClient();
  const [from, setFrom] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }));
  const [to, setTo] = useState(from);
  const [invoiceId, setInvoiceId] = useState("");
  const invoices = useQuery({
    queryKey: ["vat-journal-invoices", business?.id, from, to],
    enabled: open && !!business && !!from && !!to && from <= to,
    queryFn: async () => {
      if (!business) return [];
      const rows: { id: string; invoice_number: string | null; tax: number; created_at: string }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("sales").select("id, invoice_number, tax, created_at")
          .eq("business_id", business.id).eq("status", "completed").gt("tax", 0)
          .gte("created_at", `${from}T00:00:00+03:00`).lte("created_at", `${to}T23:59:59.999999+03:00`)
          .order("created_at").order("id").range(offset, offset + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
      }
    },
  });
  const selected = invoices.data?.find((invoice) => invoice.id === invoiceId);
  const payable = mappings.data?.accounts_payable;
  const vatPayable = mappings.data?.tax_payable || mappings.data?.output_vat;
  const configured = !!payable && !!vatPayable && payable !== vatPayable &&
    [payable, vatPayable].every((id) => accounts.data?.some((account) => account.id === id && account.is_active && account.type === "liability"));
  const preview = selected && configured ? buildInvoiceVatLines(Number(selected.tax), payable, vatPayable) : [];
  const create = useMutation({
    mutationFn: async () => {
      assertCanPost();
      if (!selected || !configured) throw new Error("Select an invoice and configure both payable accounts.");
      const { data, error } = await (supabase as any).rpc("create_invoice_vat_journal", { _sale_id: selected.id });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast.success("Invoice VAT journal draft created");
      onOpenChange(false);
      setInvoiceId("");
    },
  });
  const accountName = (id: string) => accounts.data?.find((account) => account.id === id)?.name || id;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Invoice VAT Journal</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label htmlFor="vat-from">From</Label><Input id="vat-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setInvoiceId(""); create.reset(); }} /></div>
        <div className="space-y-2"><Label htmlFor="vat-to">To</Label><Input id="vat-to" type="date" min={from} value={to} onChange={(e) => { setTo(e.target.value); setInvoiceId(""); create.reset(); }} /></div>
      </div>
      <div className="space-y-2"><Label>Invoice</Label>
        <Select value={invoiceId} onValueChange={(id) => { setInvoiceId(id); create.reset(); }}>
          <SelectTrigger aria-label="Invoice"><SelectValue placeholder={invoices.isLoading ? "Loading invoices…" : "Select invoice"} /></SelectTrigger>
          <SelectContent>{invoices.data?.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.invoice_number || invoice.id} — VAT KES {Number(invoice.tax).toFixed(2)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {from > to && <p role="alert" className="text-sm text-destructive">The end date must be on or after the start date.</p>}
      {invoices.error && <p role="alert" className="text-sm text-destructive">Invoices could not be loaded. Please try again.</p>}
      {!invoices.isLoading && !invoices.error && invoices.data?.length === 0 && <p className="text-sm text-muted-foreground">No completed VAT invoices in this period.</p>}
      {!configured && <p role="alert" className="text-sm text-destructive">Configure distinct active VAT Payable and Accounts Payable liability accounts in Accounting Settings.</p>}
      {preview.length > 0 && <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit (KES)</TableHead><TableHead className="text-right">Credit (KES)</TableHead></TableRow></TableHeader>
        <TableBody>{preview.map((line) => <TableRow key={line.account_id}><TableCell>{accountName(line.account_id)}</TableCell><TableCell className="text-right font-mono">{line.debit.toFixed(2)}</TableCell><TableCell className="text-right font-mono">{line.credit.toFixed(2)}</TableCell></TableRow>)}</TableBody>
      </Table>}
      {create.error && <p role="alert" className="text-sm text-destructive">{friendlyErrorMessage(create.error)}</p>}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!selected || !configured || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create VAT Draft"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}