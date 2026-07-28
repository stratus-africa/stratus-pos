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
import { loadReceiptConfig, saveReceiptConfig, fetchReceiptConfig, defaultReceiptConfig, FONT_OPTIONS, PAPER_OPTIONS, type ReceiptConfig, type ReceiptPaper, type QRCodeType, type QRCodePosition } from "@/lib/receiptTemplate";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";

export function ReceiptSettingsTab() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const [config, setConfig] = useState<ReceiptConfig>(defaultReceiptConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(loadReceiptConfig(business?.id));
    if (business?.id) {
      fetchReceiptConfig(business.id).then(setConfig).catch(() => {});
    }
  }, [business?.id]);

  const handleSave = async () => {
    if (!business) return;
    setSaving(true);
    try {
      await saveReceiptConfig(business.id, config);
      toast.success("Receipt template saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save receipt template");
    } finally {
      setSaving(false);
    }
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

          <div className="space-y-2">
            <Label>Printer Paper</Label>
            <Select value={config.paper} onValueChange={(v) => update("paper", v as ReceiptPaper)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPER_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Saved for this business and reused for every receipt print and reprint.</p>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Print QR Code on Receipt</Label>
                <p className="text-xs text-muted-foreground">Adds a scannable QR code to the printed receipt.</p>
              </div>
              <Switch checked={config.showQRCode} onCheckedChange={(v) => update("showQRCode", v)} />
            </div>

            {config.showQRCode && (
              <>
                <div className="space-y-2">
                  <Label>QR Code Type</Label>
                  <Select value={config.qrCodeType} onValueChange={(v) => update("qrCodeType", v as QRCodeType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoice_url">Invoice URL — links to online invoice</SelectItem>
                      <SelectItem value="fiscal_url">KRA Fiscal Verification URL</SelectItem>
                      <SelectItem value="custom">Custom URL / Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>QR Code Position on Receipt</Label>
                  <Select value={config.qrCodePosition} onValueChange={(v) => update("qrCodePosition", v as QRCodePosition)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header">Header — top of receipt</SelectItem>
                      <SelectItem value="middle">Middle — after totals</SelectItem>
                      <SelectItem value="footer">Footer — bottom of receipt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {config.qrCodeType === "custom" && (
                  <div className="space-y-2">
                    <Label>Custom Value</Label>
                    <Textarea
                      value={config.qrCodeCustomValue}
                      onChange={(e) => update("qrCodeCustomValue", e.target.value)}
                      placeholder="https://example.com/pay/{invoice}"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Placeholders: <code>{"{invoice}"}</code>, <code>{"{total}"}</code>, <code>{"{business}"}</code>
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>QR Label (optional)</Label>
                  <Input value={config.qrCodeLabel} onChange={(e) => update("qrCodeLabel", e.target.value)} placeholder="Scan to view" />
                </div>

                <div className="space-y-2">
                  <Label>QR Size: {config.qrCodeSize}px</Label>
                  <Slider value={[config.qrCodeSize]} min={64} max={200} step={8}
                    onValueChange={([v]) => update("qrCodeSize", v)} />
                </div>
              </>
            )}
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
            className="border rounded-md p-4 bg-white text-black max-w-[320px] mx-auto shadow-xs"
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
            {config.showQRCode && (
              <>
                <div className="border-t border-dashed my-2" />
                <div className="text-center space-y-1">
                  <div className="flex justify-center">
                    <QRCodeSVG
                      value={
                        config.qrCodeType === "custom"
                          ? (config.qrCodeCustomValue || "SAMPLE").replace(/\{invoice\}/g, "INV-00001").replace(/\{total\}/g, "870").replace(/\{business\}/g, business?.name || "Business")
                          : config.qrCodeType === "fiscal_url"
                          ? "https://etims.kra.go.ke/verify/SAMPLE"
                          : `${typeof window !== "undefined" ? window.location.origin : ""}/invoice/INV-00001`
                      }
                      size={config.qrCodeSize}
                      level="M"
                    />
                  </div>
                  {config.qrCodeLabel && <div className="text-[10px]">{config.qrCodeLabel}</div>}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
