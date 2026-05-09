import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}

export default function BarcodeScanner({ open, onOpenChange, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // List devices when dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    (async () => {
      try {
        // Request permission first so device labels are populated
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        tempStream.getTracks().forEach((t) => t.stop());

        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(list);
        // Prefer rear camera
        const rear = list.find((d) => /back|rear|environment/i.test(d.label));
        setDeviceId(rear?.deviceId || list[0]?.deviceId || "");
      } catch (err: any) {
        setError(err?.message || "Unable to access camera. Please grant permission.");
      }
    })();
  }, [open]);

  // Start/stop scanning when device changes
  useEffect(() => {
    if (!open || !deviceId || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromVideoDevice(deviceId, videoRef.current, (result, _err, controls) => {
        if (cancelled) return;
        if (result) {
          const text = result.getText();
          controls.stop();
          controlsRef.current = null;
          onDetected(text);
          onOpenChange(false);
          toast.success(`Scanned: ${text}`);
        }
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      })
      .catch((err) => {
        setError(err?.message || "Failed to start scanner");
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [deviceId, open, onDetected, onOpenChange]);

  // Cleanup when dialog closes
  useEffect(() => {
    if (!open) {
      controlsRef.current?.stop();
      controlsRef.current = null;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> Scan Barcode
          </DialogTitle>
          <DialogDescription>
            Point your camera at the barcode. It will detect automatically.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="space-y-3">
            {devices.length > 1 && (
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-primary/70" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Hold steady. Make sure the barcode is well-lit.
            </p>
          </div>
        )}

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          <X className="mr-2 h-4 w-4" /> Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
