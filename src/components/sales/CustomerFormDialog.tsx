import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Customer } from "@/hooks/useSales";
import { useDigitaxSettings } from "@/hooks/useDigitax";
import { useIsCustomerFiscalised } from "@/hooks/useIsFiscalised";
import { Lock } from "lucide-react";

interface CustomerLike extends Customer {
  kra_pin?: string | null;
  vat_registered?: boolean | null;
  tax_exemption_number?: string | null;
  customer_type?: string | null;
}

type SubmitPayload = Omit<Customer, "id" | "business_id" | "balance"> & {
  kra_pin?: string | null;
  vat_registered?: boolean | null;
  tax_exemption_number?: string | null;
  customer_type?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SubmitPayload) => void;
  initial?: CustomerLike | null;
  loading?: boolean;
}

export default function CustomerFormDialog({ open, onOpenChange, onSubmit, initial, loading }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [kraPin, setKraPin] = useState(initial?.kra_pin ?? "");
  const [vatRegistered, setVatRegistered] = useState<boolean>(!!initial?.vat_registered);
  const [taxExemption, setTaxExemption] = useState(initial?.tax_exemption_number ?? "");
  const [customerType, setCustomerType] = useState<string>(initial?.customer_type ?? "individual");

  const { query: digitaxQ } = useDigitaxSettings();
  const digitaxEnabled = !!digitaxQ.data?.enabled;
  const fiscalised = useIsCustomerFiscalised(initial?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      ...(digitaxEnabled ? {
        kra_pin: kraPin || null,
        vat_registered: vatRegistered,
        tax_exemption_number: taxExemption || null,
        customer_type: customerType || null,
      } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Customer" : "Add Customer"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input disabled={fiscalised} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          {digitaxEnabled && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                KRA / DigiTax
                {fiscalised && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-700">
                    <Lock className="h-3 w-3" /> Locked — customer has fiscalised sales
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">KRA PIN</Label>
                  <Input disabled={fiscalised} value={kraPin} onChange={(e) => setKraPin(e.target.value.toUpperCase())} placeholder="P051234567X" /></div>
                <div><Label className="text-xs">Customer Type</Label>
                  <Select disabled={fiscalised} value={customerType} onValueChange={setCustomerType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="government">Government</SelectItem>
                      <SelectItem value="ngo">NGO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <Label className="text-xs">VAT Registered</Label>
                  <Switch disabled={fiscalised} checked={vatRegistered} onCheckedChange={setVatRegistered} />
                </div>
                <div className="col-span-2"><Label className="text-xs">Tax Exemption Number</Label>
                  <Input disabled={fiscalised} value={taxExemption} onChange={(e) => setTaxExemption(e.target.value)} /></div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {initial ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
