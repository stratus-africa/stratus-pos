import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarcodeScanSettings, DEFAULT_SCAN_SETTINGS, loadScanSettings, fetchScanSettings, saveScanSettings,
} from "@/lib/barcodeScan";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScannerSettingsDialog({ open, onOpenChange }: Props) {
  const { business } = useBusiness();
  const [s, setS] = useState<BarcodeScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setS(loadScanSettings(business?.id));
    fetchScanSettings(business?.id).then(setS).catch(() => { /* cached */ });
  }, [open, business?.id]);

  const save = async () => {
    setSaving(true);
    try {
      await saveScanSettings({
        ...s,
        minLength: Math.max(1, Number(s.minLength) || 1),
        maxInterval: Math.max(10, Number(s.maxInterval) || 10),
        idleFlush: Math.max(50, Number(s.idleFlush) || 50),
        scanCooldown: Math.max(0, Number(s.scanCooldown) || 0),

      }, business?.id);
      toast.success("Scanner settings saved");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save scanner settings");
    } finally {
      setSaving(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Barcode scanner settings</DialogTitle>
          <DialogDescription>
            Tune detection for USB, Bluetooth and slower handheld scanners. Saved to your own account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="minLength">Minimum length</Label>
              <Input
                id="minLength" type="number" min={1} value={s.minLength}
                onChange={(e) => setS({ ...s, minLength: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxInterval">Max key interval (ms)</Label>
              <Input
                id="maxInterval" type="number" min={10} value={s.maxInterval}
                onChange={(e) => setS({ ...s, maxInterval: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Enter handling</Label>
            <Select
              value={s.enterHandling}
              onValueChange={(v) => setS({ ...s, enterHandling: v as BarcodeScanSettings["enterHandling"] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Required — scanner always sends Enter</SelectItem>
                <SelectItem value="optional">Optional — Enter or idle timeout</SelectItem>
                <SelectItem value="ignore">Ignore — idle timeout only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {s.enterHandling !== "required" && (
            <div className="space-y-1.5">
              <Label htmlFor="idleFlush">Idle flush delay (ms)</Label>
              <Input
                id="idleFlush" type="number" min={50} value={s.idleFlush}
                onChange={(e) => setS({ ...s, idleFlush: Number(e.target.value) })}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="scanCooldown">Same-code cooldown (ms)</Label>
            <Input
              id="scanCooldown" type="number" min={0} value={s.scanCooldown}
              onChange={(e) => setS({ ...s, scanCooldown: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Repeats of the exact same barcode inside this window are ignored, so a
              scanner burst cannot double-add an item. Set 0 to disable.
            </p>
          </div>


          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-4">
              <Label htmlFor="autoAdd">Scan automatically adds item to cart</Label>
              <p className="text-xs text-muted-foreground">
                Matched scans go straight into the cart without any click.
              </p>
            </div>
            <Switch
              id="autoAdd" checked={s.autoAddToCart}
              onCheckedChange={(v) => setS({ ...s, autoAddToCart: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-4">
              <Label htmlFor="parseGs1">Parse GS1 / GTIN labels</Label>
              <p className="text-xs text-muted-foreground">
                Reads GTIN, batch and weight/price-embedded retail barcodes.
              </p>
            </div>
            <Switch
              id="parseGs1" checked={s.parseGs1}
              onCheckedChange={(v) => setS({ ...s, parseGs1: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-4">
              <Label htmlFor="openSearch">Open search on unknown barcode</Label>
              <p className="text-xs text-muted-foreground">
                Fills the search box with the scanned code for manual selection.
              </p>
            </div>
            <Switch
              id="openSearch" checked={s.openSearchOnMiss}
              onCheckedChange={(v) => setS({ ...s, openSearchOnMiss: v })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setS(DEFAULT_SCAN_SETTINGS)}>Reset defaults</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
