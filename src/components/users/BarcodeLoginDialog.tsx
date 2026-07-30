import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Printer, RefreshCw, Trash2, Unlock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  userLabel: string;
  hasBarcode?: boolean;
}

const genBarcode = () => {
  const chars = "ACDEFGHJKLMNPQRTUVWXY34679";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `U${s}`;
};

export default function BarcodeLoginDialog({ open, onOpenChange, userId, userLabel, hasBarcode }: Props) {
  const [barcode, setBarcode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [includePin, setIncludePin] = useState(true);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const pinValid = /^[0-9]{4,8}$/.test(pin);
  // One-scan login payload: the sign-in screen splits "BARCODE*PIN".
  const printedValue = includePin && pinValid ? `${barcode}*${pin}` : barcode;

  useEffect(() => {
    if (!open) return;
    setBarcode(genBarcode());
    setPin(""); setPin2("");
  }, [open]);

  useEffect(() => {
    if (!svgRef.current || !printedValue) return;
    try {
      JsBarcode(svgRef.current, printedValue, { format: "CODE128", height: 60, width: 2, displayValue: true, fontSize: 14, margin: 8 });
    } catch { /* ignore */ }
  }, [printedValue]);


  const save = async () => {
    if (!/^[0-9]{4,8}$/.test(pin)) return toast.error("PIN must be 4–8 digits");
    if (pin !== pin2) return toast.error("PINs do not match");
    if (barcode.length < 4) return toast.error("Barcode is too short");
    setSaving(true);
    const { error } = await (supabase as any).rpc("set_user_login_barcode", {
      _user_id: userId, _barcode: barcode, _pin: pin,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Barcode login saved");
    onOpenChange(false);
  };

  const clear = async () => {
    if (!confirm("Remove barcode login for this user?")) return;
    const { error } = await (supabase as any).rpc("clear_user_login_barcode", { _user_id: userId });
    if (error) return toast.error(error.message);
    toast.success("Barcode login removed");
    onOpenChange(false);
  };

  const unlock = async () => {
    if (!barcode) return toast.error("No barcode to unlock");
    const { data, error } = await (supabase as any).rpc("unlock_barcode", { _barcode: barcode, _ip: null });
    if (error) return toast.error(error.message);
    toast.success(`Lockout cleared (${data ?? 0} attempt records removed)`);
  };

  const print = () => {
    if (!svgRef.current) return;
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const w = window.open("", "_blank", "width=500,height=400");
    if (!w) return;
    w.document.write(`<html><head><title>${userLabel} — Login Barcode</title></head><body style="font-family:sans-serif;text-align:center;padding:24px"><h3>${userLabel}</h3>${svg}<p style="color:#666;font-size:12px">Scan and enter your PIN to sign in</p><script>window.print();</script></body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Barcode Login — {userLabel}</DialogTitle>
          <DialogDescription>Assign a scannable barcode and a numeric PIN this user will use at sign-in.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 flex flex-col items-center">
            <svg ref={svgRef} />
          </div>

          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <div className="flex gap-2">
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value.toUpperCase())} maxLength={64} />
              <Button type="button" variant="outline" size="icon" onClick={() => setBarcode(genBarcode())} title="Generate new">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>PIN (4–8 digits)</Label>
              <Input inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm PIN</Label>
              <Input inputMode="numeric" pattern="[0-9]*" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="••••" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {hasBarcode && (
              <Button type="button" variant="outline" onClick={clear}>
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            )}
            <Button type="button" variant="outline" onClick={unlock} title="Clear failed PIN attempts for this barcode">
              <Unlock className="h-4 w-4 mr-1" /> Unlock
            </Button>
            <Button type="button" variant="outline" onClick={print}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
