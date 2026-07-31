import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { barcodeLogin } from "@/lib/barcodeLogin.functions";
import { ScanLine, Camera } from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

// A scanned payload may carry the PIN too: "BARCODE*1234" / "BARCODE|1234" / "BARCODE-1234"
const splitPayload = (raw: string): { barcode: string; pin: string | null } => {
  const v = raw.trim();
  const m = v.match(/^(.+?)[*|#-]([0-9]{4,8})$/);
  if (m) return { barcode: m[1].trim(), pin: m[2] };
  return { barcode: v, pin: null };
};

export default function BarcodeSignInDialog({ open, onOpenChange, onSuccess }: Props) {
  const callBarcodeLogin = useServerFn(barcodeLogin);
  const [barcode, setBarcode] = useState("");
  const [pin, setPin] = useState("");
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setBarcode(""); setPin("");
      setTimeout(() => barcodeRef.current?.focus(), 60);
    }
  }, [open]);

  const [pinPrompt, setPinPrompt] = useState<string | null>(null);

  /** Ask for the PIN manually — used when the scan carries none, or the embedded one is rejected. */
  const askForPin = (message: string) => {
    setPin("");
    setPinPrompt(message);
    setTimeout(() => pinRef.current?.focus(), 60);
  };

  const doLogin = async (bc: string, code: string): Promise<boolean> => {
    if (submittingRef.current) return false;
    if (!bc || !/^[0-9]{4,8}$/.test(code)) {
      toast.error("Scan a barcode and enter a 4–8 digit PIN");
      return false;
    }
    submittingRef.current = true;
    setSubmitting(true);
    let data: { email: string; token_hash: string } | null = null;
    let error: Error | null = null;
    try {
      data = await callBarcodeLogin({ data: { barcode: bc.trim(), pin: code } });
    } catch (e) {
      error = e as Error;
    }
    if (error || !data?.token_hash) {
      submittingRef.current = false;
      setSubmitting(false);
      toast.error(error?.message || "Invalid barcode or PIN");
      return false;
    }
    const { error: otpErr } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: "magiclink",
    });
    submittingRef.current = false;
    setSubmitting(false);
    if (otpErr) { toast.error(otpErr.message); return false; }
    setPinPrompt(null);
    toast.success("Welcome back!");
    onOpenChange(false);
    onSuccess?.();
    return true;
  };

  // Handles both a manual submit and a scanner payload that includes the PIN.
  const handleScanned = async (raw: string) => {
    const { barcode: bc, pin: code } = splitPayload(raw);
    setBarcode(bc);
    if (code) {
      setPin(code);
      setPinPrompt(null);
      const ok = await doLogin(bc, code);
      // Embedded PIN rejected — fall back to asking the user for it.
      if (!ok) askForPin("That barcode's PIN wasn't accepted. Enter your PIN to continue.");
    } else {
      askForPin("Barcode scanned. Enter your PIN to sign in.");
    }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await doLogin(barcode, pin);
  };



  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in with barcode</DialogTitle>
            <DialogDescription>Scan your login barcode — if it includes your PIN you'll be signed in automatically.</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bc">Barcode</Label>
              <div className="flex gap-2">
                <Input
                  id="bc"
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBarcode(v);
                    // Scanner pasted a combined payload without pressing Enter.
                    const parsed = splitPayload(v);
                    if (parsed.pin) handleScanned(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (barcode) handleScanned(barcode);
                    }
                  }}
                  placeholder="Scan or type barcode"
                  autoComplete="off"
                  className="h-11"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setScanning(true)} title="Use camera">
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ScanLine className="h-3 w-3" /> USB/Bluetooth scanners work automatically.
              </p>
            </div>


            <div className="space-y-1.5">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                ref={pinRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Your 4–8 digit PIN"
                className="h-11 tracking-widest"
                autoComplete="one-time-code"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scanning}
        onOpenChange={setScanning}
        onDetected={(code) => {
          setScanning(false);
          handleScanned(code);
        }}
      />
    </>

  );
}
