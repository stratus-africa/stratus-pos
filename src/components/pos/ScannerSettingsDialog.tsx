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
  BarcodeScanSettings, DEFAULT_SCAN_SETTINGS, loadScanSettings, saveScanSettings,
} from "@/lib/barcodeScan";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScannerSettingsDialog({ open, onOpenChange }: Props) {
  const [s, setS] = useState<BarcodeScanSettings>(DEFAULT_SCAN_SETTINGS);

  useEffect(() => {
    if (open) setS(loadScanSettings());
  }, [open]);

  const save = () => {
    saveScanSettings({
      ...s,
      minLength: Math.max(1, Number(s.minLength) || 1),
      maxInterval: Math.max(10, Number(s.maxInterval) || 10),
      idleFlush: Math.max(50, Number(s.idleFlush) || 50),
    });
    toast.success("Scanner settings saved");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Barcode scanner settings</DialogTitle>
          <DialogDescription>
            Tune detection for USB, Bluetooth and slower handheld scanners.
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
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
