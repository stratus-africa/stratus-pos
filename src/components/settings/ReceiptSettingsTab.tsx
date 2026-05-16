import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import { loadReceiptConfig, saveReceiptConfig, defaultReceiptConfig, FONT_OPTIONS, type ReceiptConfig } from "@/lib/receiptTemplate";
import { format } from "date-fns";

export function ReceiptSettingsTab() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const [config, setConfig] = useState<ReceiptConfig>(defaultReceiptConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(loadReceiptConfig(business?.id));
  }, [business?.id]);

  const handleSave = () => {
    if (!business) return;
    setSaving(true);
    saveReceiptConfig(business.id, config);
    setTimeout(() => {
      setSaving(false);
      toast.success("Receipt template saved");
    }, 200);
  };

  const update = <K extends keyof ReceiptConfig>(key: K, value: ReceiptConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const servedBy = useMemo(() => {
    const meta = (user?.user_metadata || {}) as { full_name?: string };
    return meta.full_name || user?.email || "—";
  }, [user]);

  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <Card>
        <CardHeader>
          <CardTitle>Receipt Template</CardTitle>
          <CardDescription>Customize how your receipts look when printed. The preview updates live.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Header Text</Label>
            <Input
              value={config.header}
              onChange={(e) => update("header", e.target.value)}
              placeholder={business?.name || "Business Name"}
            />
            <p className="text-xs text-muted-foreground">Appears at the top of every receipt. Defaults to your business name.</p>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Font Family</Label>
              <Select value={config.fontFamily} onValueChange={(v) => update("fontFamily", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Body Font Size: {config.fontSize}px</Label>
              <Slider value={[config.fontSize]} min={9} max={18} step={1}
                onValueChange={([v]) => update("fontSize", v)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Header Font Size: {config.headerFontSize}px</Label>
              <Slider value={[config.headerFontSize]} min={11} max={24} step={1}
                onValueChange={([v]) => update("headerFontSize", v)} />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Display Options</Label>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show business logo</Label>
              <Switch checked={config.showLogo} onCheckedChange={(v) => update("showLogo", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show business address</Label>
              <Switch checked={config.showAddress} onCheckedChange={(v) => update("showAddress", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show phone number</Label>
              <Switch checked={config.showPhone} onCheckedChange={(v) => update("showPhone", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show tax breakdown</Label>
              <Switch checked={config.showTaxBreakdown} onCheckedChange={(v) => update("showTaxBreakdown", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show "Served By" at footer</Label>
              <Switch checked={config.showServedBy} onCheckedChange={(v) => update("showServedBy", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show printed date/time at footer</Label>
              <Switch checked={config.showPrintedAt} onCheckedChange={(v) => update("showPrintedAt", v)} />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Thank You Message</Label>
            <Input
              value={config.thankYouMessage}
              onChange={(e) => update("thankYouMessage", e.target.value)}
              placeholder="Thank you for your purchase!"
            />
          </div>

          <div className="space-y-2">
            <Label>Footer Text</Label>
            <Textarea
              value={config.footer}
              onChange={(e) => update("footer", e.target.value)}
              placeholder="Return policy, contact info, etc."
              rows={3}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle className="text-sm">Live Preview</CardTitle>
          <CardDescription className="text-xs">This is how a printed receipt will look.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border rounded-md p-4 bg-white text-black max-w-[320px] mx-auto shadow-sm"
            style={{ fontFamily: config.fontFamily, fontSize: `${config.fontSize}px`, lineHeight: 1.45 }}
          >
            <div className="text-center space-y-1">
              {config.showLogo && business?.logo_url && (
                <img src={business.logo_url} alt="logo" className="mx-auto max-h-16 object-contain" />
              )}
              <div className="font-bold" style={{ fontSize: `${config.headerFontSize}px` }}>
                {config.header || business?.name || "Business Name"}
              </div>
              {config.showAddress && <div className="opacity-70">{(business as { address?: string })?.address || "123 Sample Street"}</div>}
              {config.showPhone && <div className="opacity-70">{(business as { phone?: string })?.phone || "+254 700 000 000"}</div>}
            </div>
            <div className="border-t border-dashed my-2" />
            <div>Invoice: INV-00001</div>
            <div>Date: {format(new Date(), "PPp")}</div>
            <div className="border-t border-dashed my-2" />
            <div className="flex justify-between"><span>Sample Product x2</span><span>500.00</span></div>
            <div className="flex justify-between"><span>Another Item x1</span><span>250.00</span></div>
            <div className="border-t border-dashed my-2" />
            <div className="flex justify-between"><span>Subtotal</span><span>750.00</span></div>
            {config.showTaxBreakdown && <div className="flex justify-between"><span>VAT (16%)</span><span>120.00</span></div>}
            <div className="flex justify-between font-bold" style={{ fontSize: `${config.fontSize + 1}px` }}>
              <span>TOTAL</span><span>{business?.currency || "KES"} 870.00</span>
            </div>
            <div className="border-t border-dashed my-2" />
            <div className="flex justify-between"><span>Cash</span><span>1,000.00</span></div>
            <div className="flex justify-between"><span>Change</span><span>130.00</span></div>
            <div className="border-t border-dashed my-2" />
            <div className="text-center">{config.thankYouMessage}</div>
            {config.footer && <div className="text-center mt-1 whitespace-pre-wrap">{config.footer}</div>}
            {(config.showServedBy || config.showPrintedAt) && (
              <div className="border-t border-dashed my-2" />
            )}
            {config.showServedBy && (
              <div className="text-center opacity-80">Served by: {servedBy}</div>
            )}
            {config.showPrintedAt && (
              <div className="text-center opacity-80">Printed: {format(new Date(), "PPp")}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
