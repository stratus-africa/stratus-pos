import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CashDrawerConfig,
  DEFAULT_CASH_DRAWER,
  isWebSerialSupported,
  isWebUsbSupported,
  loadCashDrawerConfig,
  pickSerialPort,
  pickUsbDevice,
  saveCashDrawerConfig,
  testCashDrawer,
} from "@/lib/cashDrawer";

export default function CashDrawerTab() {
  const [cfg, setCfg] = useState<CashDrawerConfig>(DEFAULT_CASH_DRAWER);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCfg(loadCashDrawerConfig()); }, []);

  const update = (patch: Partial<CashDrawerConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const save = () => { saveCashDrawerConfig(cfg); toast.success("Cash drawer settings saved"); };

  const pick = async () => {
    setBusy(true);
    try {
      if (cfg.mode === "serial") await pickSerialPort();
      else if (cfg.mode === "usb") await pickUsbDevice();
      toast.success("Device paired for this browser");
    } catch (e: any) {
      toast.error(e.message || "Pairing cancelled");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try { await testCashDrawer(cfg); toast.success("Drawer opened"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const kickCodeStr = cfg.kickCode.map((n) => n.toString(16).padStart(2, "0").toUpperCase()).join(" ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Drawer</CardTitle>
        <CardDescription>
          Automatically open the cash drawer when a payment is completed. Connect via a USB or COM (serial) receipt printer/drawer.
          You must pair the device once per browser (a user gesture is required).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Auto-open on payment</Label>
            <p className="text-xs text-muted-foreground">Sends the kick pulse when a cash sale is finalised.</p>
          </div>
          <Switch checked={cfg.autoOpen} onCheckedChange={(v) => update({ autoOpen: v })} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Connection</Label>
            <Select value={cfg.mode} onValueChange={(v: any) => update({ mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Disabled</SelectItem>
                <SelectItem value="serial" disabled={!isWebSerialSupported()}>
                  Serial / COM (Web Serial) {!isWebSerialSupported() && "— unsupported"}
                </SelectItem>
                <SelectItem value="usb" disabled={!isWebUsbSupported()}>
                  USB (Web USB) {!isWebUsbSupported() && "— unsupported"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cfg.mode === "serial" && (
            <div className="space-y-1.5">
              <Label>Baud rate</Label>
              <Input
                type="number"
                value={cfg.baudRate}
                onChange={(e) => update({ baudRate: parseInt(e.target.value || "9600", 10) })}
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>ESC/POS kick code (hex)</Label>
          <Input
            value={kickCodeStr}
            onChange={(e) => {
              const bytes = e.target.value
                .split(/[\s,]+/).filter(Boolean)
                .map((t) => parseInt(t, 16))
                .filter((n) => Number.isFinite(n) && n >= 0 && n <= 255);
              update({ kickCode: bytes.length ? bytes : DEFAULT_CASH_DRAWER.kickCode });
            }}
          />
          <p className="text-xs text-muted-foreground">Default <code>1B 70 00 19 FA</code> works with most Epson-compatible printers.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={pick} disabled={busy || cfg.mode === "off"}>Pair device…</Button>
          <Button variant="outline" onClick={test} disabled={busy || cfg.mode === "off"}>Test open</Button>
          <Button onClick={save} disabled={busy}>Save settings</Button>
        </div>

        {!isWebSerialSupported() && !isWebUsbSupported() && (
          <p className="text-xs text-destructive">
            This browser does not support Web Serial or Web USB. Use Chrome, Edge or Opera on a desktop to control the drawer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
