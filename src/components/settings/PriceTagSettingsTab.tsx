import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  loadPriceTagConfig,
  savePriceTagConfig,
  fetchPriceTagConfig,
  defaultPriceTagConfig,
  PRICE_TAG_FONT_OPTIONS,
  PRICE_TAG_LAYOUTS,
  PAPER_MODE_OPTIONS,
  THERMAL_80_PRINTABLE_MM,
  type PriceTagConfig,
  type TextAlign,
} from "@/lib/priceTagTemplate";

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

function PreviewBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, margin: 0, height: 32, width: 1.4 });
    } catch {}
  }, [value]);
  return <svg ref={ref} style={{ width: "100%", height: 32 }} />;
}

export function PriceTagSettingsTab() {
  const { business } = useBusiness();
  const [config, setConfig] = useState<PriceTagConfig>(defaultPriceTagConfig);

  useEffect(() => {
    setConfig(loadPriceTagConfig(business?.id));
    if (business?.id) {
      fetchPriceTagConfig(business.id).then(setConfig).catch(() => {});
    }
  }, [business?.id]);

  const update = <K extends keyof PriceTagConfig>(key: K, value: PriceTagConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const handleSave = async () => {
    if (!business) return;
    try {
      await savePriceTagConfig(business.id, config);
      toast.success("Price tag template saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save price tag template");
    }
  };

  const currency = business?.currency || "KES";
  const samplePrice = new Intl.NumberFormat("en-KE", {
    style: config.showCurrency ? "currency" : "decimal",
    currency,
    maximumFractionDigits: 2,
  }).format(1250);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price Tag Template</CardTitle>
        <CardDescription>Customize how printed price tags look. Applies to both product and batch tags.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Paper / printer</Label>
              <Select value={config.paperMode} onValueChange={(v) => update("paperMode", v as PriceTagConfig["paperMode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAPER_MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default layout</Label>
              <Select value={config.layout} onValueChange={(v) => update("layout", v as PriceTagConfig["layout"])} disabled={config.paperMode === "thermal80"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRICE_TAG_LAYOUTS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tag width (mm)</Label>
              <Input
                type="number"
                min={20}
                max={config.paperMode === "thermal80" ? THERMAL_80_PRINTABLE_MM : 210}
                value={config.tagWidthMm}
                onChange={(e) => update("tagWidthMm", Number(e.target.value) || 1)}
              />
              {config.paperMode === "thermal80" && (
                <p className="text-xs text-muted-foreground">80mm roll printable width is {THERMAL_80_PRINTABLE_MM}mm.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tag height (mm)</Label>
              <Input type="number" min={10} max={150} value={config.tagHeightMm} onChange={(e) => update("tagHeightMm", Number(e.target.value) || 1)} />
            </div>
            <div className="space-y-2">
              <Label>Gap between tags (mm)</Label>
              <Input type="number" min={0} max={20} value={config.gapMm} onChange={(e) => update("gapMm", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Inner padding (mm)</Label>
              <Input type="number" min={0} max={10} value={config.paddingMm} onChange={(e) => update("paddingMm", Number(e.target.value) || 0)} />
            </div>

            <div className="space-y-2">
              <Label>Font family</Label>
              <Select value={config.fontFamily} onValueChange={(v) => update("fontFamily", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRICE_TAG_FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name font size: {config.nameFontSize}px</Label>
              <Slider value={[config.nameFontSize]} min={8} max={20} step={1} onValueChange={([v]) => update("nameFontSize", v)} />
            </div>
            <div className="space-y-2">
              <Label>Price font size: {config.priceFontSize}px</Label>
              <Slider value={[config.priceFontSize]} min={10} max={28} step={1} onValueChange={([v]) => update("priceFontSize", v)} />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Display options</Label>
            {[
              ["showBusinessName", "Show business name"],
              ["showProductName", "Show product name"],
              ["showSku", "Show SKU"],
              ["showBarcode", "Show barcode"],
              ["showPrice", "Show price"],
              ["showCurrency", "Show currency symbol"],
              ["showBatch", "Show batch / expiry (batch tags)"],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between">
                <Label className="text-sm font-normal">{label}</Label>
                <Switch
                  checked={config[k as keyof PriceTagConfig] as boolean}
                  onCheckedChange={(v) => update(k as keyof PriceTagConfig, v as never)}
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Border style</Label>
              <Select value={config.borderStyle} onValueChange={(v) => update("borderStyle", v as PriceTagConfig["borderStyle"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashed">Dashed</SelectItem>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Border color</Label>
              <Input type="color" value={config.borderColor} onChange={(e) => update("borderColor", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Price color</Label>
              <Input type="color" value={config.priceColor} onChange={(e) => update("priceColor", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Background</Label>
              <Input type="color" value={config.backgroundColor} onChange={(e) => update("backgroundColor", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Footer text (optional)</Label>
              <Input value={config.footerText} onChange={(e) => update("footerText", e.target.value)} placeholder="e.g. Non-refundable" />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Text alignment</Label>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["businessNameAlign", "Business name"],
                ["nameAlign", "Product name"],
                ["metaAlign", "SKU / batch"],
                ["priceAlign", "Price"],
                ["footerAlign", "Footer"],
              ] as [keyof PriceTagConfig, string][]).map(([k, label]) => (
                <div key={k} className="space-y-2">
                  <Label className="text-sm font-normal">{label}</Label>
                  <Select
                    value={config[k] as TextAlign}
                    onValueChange={(v) => update(k, v as never)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALIGN_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>


          <div className="flex justify-end">
            <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" /> Save price tag template</Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Preview</Label>
          <div className="rounded-md border p-4 bg-muted/30 flex justify-center">
            <div
              style={{
                width: `${config.paperMode === "thermal80" ? Math.min(config.tagWidthMm, THERMAL_80_PRINTABLE_MM) : config.tagWidthMm}mm`,
                minHeight: `${config.tagHeightMm}mm`,
                boxSizing: "border-box",
                overflow: "hidden",
                padding: `${config.paddingMm}mm`,
                background: config.backgroundColor,
                border: config.borderStyle === "none" ? "none" : `1px ${config.borderStyle} ${config.borderColor}`,
                borderRadius: 6,
                fontFamily: config.fontFamily,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 6,
              }}
            >
              <div>
                {config.showBusinessName && business?.name && (
                  <div style={{ fontSize: 10, color: "#64748b", textAlign: config.businessNameAlign }}>{business.name}</div>
                )}
                {config.showProductName && (
                  <div style={{ fontWeight: 600, fontSize: config.nameFontSize, lineHeight: 1.2, textAlign: config.nameAlign }}>Sample product</div>
                )}
                {config.showSku && <div style={{ fontSize: 10, color: "#64748b", textAlign: config.metaAlign }}>SKU: SAMPLE-001</div>}
                {config.showBatch && (
                  <div style={{ fontSize: 10, color: "#334155", textAlign: config.metaAlign }}>Batch: B-042 · Exp 12/2026</div>
                )}
              </div>
              {config.showBarcode && <PreviewBarcode value="SAMPLE-001" />}
              {config.showPrice && (
                <div style={{ fontWeight: 700, fontSize: config.priceFontSize, color: config.priceColor, textAlign: config.priceAlign }}>{samplePrice}</div>
              )}
              {config.footerText && (
                <div style={{ fontSize: 9, color: "#64748b", textAlign: config.footerAlign }}>{config.footerText}</div>
              )}

            </div>
          </div>
          <p className="text-xs text-muted-foreground">Preview uses sample data. Actual tags use each product's details.</p>
        </div>
      </CardContent>
    </Card>
  );
}
