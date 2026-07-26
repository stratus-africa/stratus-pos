import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CustomerDisplayConfig,
  DEFAULT_CUSTOMER_DISPLAY,
  displayWelcome,
  formatAmount,
  isWebSerialSupported,
  isWebUsbSupported,
  loadCustomerDisplayConfig,
  padLine,
  padPair,
  pickDisplaySerialPort,
  pickDisplayUsbDevice,
  saveCustomerDisplayConfig,
  testCustomerDisplay,
} from "@/lib/customerDisplay";

export default function CustomerDisplayTab() {
  const [cfg, setCfg] = useState<CustomerDisplayConfig>(DEFAULT_CUSTOMER_DISPLAY);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCfg(loadCustomerDisplayConfig()); }, []);

  const update = (patch: Partial<CustomerDisplayConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const save = () => { saveCustomerDisplayConfig(cfg); toast.success("Customer display settings saved"); };

  const pick = async () => {
    setBusy(true);
    try {
      if (cfg.mode === "serial") await pickDisplaySerialPort();
      else if (cfg.mode === "usb") await pickDisplayUsbDevice();
      toast.success("Display paired for this browser");
    } catch (e: any) {
      toast.error(e.message || "Pairing cancelled");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try { await testCustomerDisplay(cfg); toast.success("Test message sent"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const showWelcome = async () => {
    setBusy(true);
    try {
      const ok = await displayWelcome(cfg);
      ok ? toast.success("Welcome message sent") : toast.error("Display did not respond");
    } finally { setBusy(false); }
  };

  const preview1 = padPair("Milk 500ml x2", formatAmount(240, cfg), cfg.columns);
  const preview2 = padPair("TOTAL", formatAmount(1240, cfg), cfg.columns);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Display Pole</CardTitle>
        <CardDescription>
          Show scanned items, the running total and change on a customer-facing pole display (VFD/LCD).
          Connect via COM (serial) or USB and pair the device once per browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Connection</Label>
            <Select value={cfg.mode} onValueChange={(v: any) => update({ mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Disabled</SelectItem>
                <SelectItem value="serial" disabled={!isWebSerialSupported()}>Serial / COM (Web Serial)</SelectItem>
                <SelectItem value="usb" disabled={!isWebUsbSupported()}>USB (Web USB)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Protocol</Label>
            <Select value={cfg.protocol} onValueChange={(v: any) => update({ protocol: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="escpos">ESC/POS (Epson compatible)</SelectItem>
                <SelectItem value="plain">Plain text</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cfg.mode === "serial" && (
            <div className="space-y-1.5">
              <Label>Baud rate</Label>
              <Input type="number" value={cfg.baudRate} onChange={(e) => update({ baudRate: parseInt(e.target.value || "9600", 10) })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Characters per line</Label>
            <Input type="number" value={cfg.columns} onChange={(e) => update({ columns: Math.max(8, parseInt(e.target.value || "20", 10)) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Lines</Label>
            <Select value={String(cfg.lines)} onValueChange={(v) => update({ lines: parseInt(v, 10) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 line</SelectItem>
                <SelectItem value="2">2 lines</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Currency prefix</Label>
            <Input value={cfg.currency} onChange={(e) => update({ currency: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Show scanned item</Label>
            <p className="text-xs text-muted-foreground">Line 1 shows the last item added; otherwise only the total is shown.</p>
          </div>
          <Switch checked={cfg.showLineItems} onCheckedChange={(v) => update({ showLineItems: v })} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Idle message line 1</Label>
            <Input value={cfg.welcomeLine1} onChange={(e) => update({ welcomeLine1: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Idle message line 2</Label>
            <Input value={cfg.welcomeLine2} onChange={(e) => update({ welcomeLine2: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Thank you line 1</Label>
            <Input value={cfg.thankYouLine1} onChange={(e) => update({ thankYouLine1: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Thank you line 2</Label>
            <Input value={cfg.thankYouLine2} onChange={(e) => update({ thankYouLine2: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Preview</Label>
          <pre className="rounded-md bg-foreground/90 text-background font-mono text-xs p-3 leading-6 overflow-x-auto">
{preview1}
{"\n"}{cfg.lines > 1 ? preview2 : padLine("", cfg.columns)}
          </pre>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={pick} disabled={busy || cfg.mode === "off"}>Pair device…</Button>
          <Button variant="outline" onClick={test} disabled={busy || cfg.mode === "off"}>Send test</Button>
          <Button variant="outline" onClick={showWelcome} disabled={busy || cfg.mode === "off"}>Show idle message</Button>
          <Button onClick={save} disabled={busy}>Save settings</Button>
        </div>

        {!isWebSerialSupported() && !isWebUsbSupported() && (
          <p className="text-xs text-destructive">
            This browser does not support Web Serial or Web USB. Use Chrome, Edge or Opera on a desktop terminal.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
