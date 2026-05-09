import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface PackageOption {
  id: string;
  name: string;
}

export function AddBusinessDialog({ open, onOpenChange, onCreated }: Props) {
  const [businessName, setBusinessName] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [timezone, setTimezone] = useState("Africa/Nairobi");
  const [taxRate, setTaxRate] = useState("16");
  const [locationName, setLocationName] = useState("Main Store");

  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const [packageId, setPackageId] = useState<string>("none");
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("subscription_packages")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPackages((data || []) as PackageOption[]));
  }, [open]);

  const reset = () => {
    setBusinessName("");
    setCurrency("KES");
    setTimezone("Africa/Nairobi");
    setTaxRate("16");
    setLocationName("Main Store");
    setOwnerFullName("");
    setOwnerEmail("");
    setOwnerPassword("");
    setPackageId("none");
  };

  const handleSubmit = async () => {
    if (!businessName.trim() || !ownerFullName.trim() || !ownerEmail.trim() || ownerPassword.length < 6) {
      toast.error("Fill all fields. Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("super-admin-create-business", {
        body: {
          businessName: businessName.trim(),
          currency,
          timezone,
          taxRate: parseFloat(taxRate) || 0,
          ownerFullName: ownerFullName.trim(),
          ownerEmail: ownerEmail.trim().toLowerCase(),
          ownerPassword,
          locationName: locationName.trim() || "Main Store",
          packageId: packageId === "none" ? null : packageId,
        },
      });
      if (error || !data?.ok) {
        throw new Error(error?.message || data?.error || "Failed to create business");
      }
      toast.success(`Created ${data.business.name} with owner ${data.owner.email}`);
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to create business");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Business</DialogTitle>
          <DialogDescription>
            Create a business and its owner account. The owner will be able to log in with the email and password you set here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">Business Details</Label>
          </div>
          <div className="space-y-2">
            <Label>Business Name *</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Acme Retail Ltd" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KES">KES</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="UGX">UGX</SelectItem>
                  <SelectItem value="TZS">TZS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <Input type="number" min={0} max={100} step={0.5} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Nairobi">Africa/Nairobi</SelectItem>
                  <SelectItem value="Africa/Lagos">Africa/Lagos</SelectItem>
                  <SelectItem value="Africa/Cairo">Africa/Cairo</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Initial Location Name</Label>
            <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm font-semibold text-muted-foreground pt-2 block">Owner Account</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="jane@acme.co.ke" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Temporary Password * (min 6 chars)</Label>
            <Input type="text" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} placeholder="Share this with the owner" />
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm font-semibold text-muted-foreground pt-2 block">Plan (optional)</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger><SelectValue placeholder="No plan — owner subscribes later" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No plan — owner subscribes later</SelectItem>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} (manual / comp)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Manually assigning a plan grants 1 month of access without payment.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Business
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
