import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/contexts/BusinessContext";
import { Printer } from "lucide-react";
import { loadPriceTagConfig, PRICE_TAG_LAYOUTS, PAPER_MODE_OPTIONS, THERMAL_80_PRINTABLE_MM, type PriceTagConfig } from "@/lib/priceTagTemplate";

export interface PrintTagItem {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  selling_price: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: PrintTagItem[];
}

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, margin: 0, height: 32, width: 1.4 });
    } catch {}
  }, [value]);
  return <svg ref={ref} className="w-full h-8" />;
}

export function PrintTagsDialog({ open, onOpenChange, items }: Props) {
  const { business } = useBusiness();
  const [cfg, setCfg] = useState<PriceTagConfig>(() => loadPriceTagConfig(business?.id));
  // Always print exactly what was designed in Settings → Customization.
  useEffect(() => {
    if (!business?.id) return;
    setCfg(loadPriceTagConfig(business.id));
    void fetchPriceTagConfig(business.id).then(setCfg).catch(() => {});
  }, [business?.id, open]);

  const [copiesPerItem, setCopiesPerItem] = useState(1);
  const currency = business?.currency || "KES";

  const layoutKey = cfg.layout;
  const paperMode = cfg.paperMode;
  const isThermal = paperMode === "thermal80";
  const layout = PRICE_TAG_LAYOUTS[layoutKey];
  const widthMm = cfg.tagWidthMm;
  const heightMm = cfg.tagHeightMm;
  const effWidth = isThermal ? Math.min(widthMm, THERMAL_80_PRINTABLE_MM) : widthMm;
  const cols = isThermal ? 1 : layout.cols;
  const gap = cfg.gapMm;
  const pad = cfg.paddingMm;



  const expanded = useMemo(() => {
    const arr: PrintTagItem[] = [];
    const n = Math.max(1, Math.min(50, copiesPerItem));
    for (const it of items) for (let i = 0; i < n; i++) arr.push(it);
    return arr;
  }, [items, copiesPerItem]);

  const formatPrice = (v: number) =>
    new Intl.NumberFormat("en-KE", {
      style: cfg.showCurrency ? "currency" : "decimal",
      currency,
      maximumFractionDigits: 2,
    }).format(v || 0);

  const borderCss = cfg.borderStyle === "none" ? "none" : `1px ${cfg.borderStyle} ${cfg.borderColor}`;

  const handlePrint = () => {
    const node = document.getElementById("print-tags-sheet");
    if (!node) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    const pageCss = isThermal
      ? `@page { size: 80mm auto; margin: 2mm; }`
      : `@page { size: A4; margin: 8mm; }`;
    win.document.write(`<!doctype html><html><head><title>Price tags</title>
      <style>
        ${pageCss}
        body { font-family: ${cfg.fontFamily}; margin: 0; background: #fff; }
        .sheet { display: grid; grid-template-columns: repeat(${cols}, ${isThermal ? `${effWidth}mm` : "1fr"}); gap: ${gap}mm; }
        .tag { border: ${borderCss}; border-radius: 4px; padding: ${pad}mm; display: flex; flex-direction: column; justify-content: space-between; width: ${effWidth}mm; min-height: ${heightMm}mm; box-sizing: border-box; overflow: hidden; page-break-inside: avoid; background: ${cfg.backgroundColor}; }
        .tag svg { width: 100%; height: 30px; }
      </style></head><body>${node.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 250);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Print price tags ({items.length})</DialogTitle></DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Paper</Label>
            <Select value={paperMode} onValueChange={(v) => setPaperMode(v as PriceTagConfig["paperMode"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPER_MODE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Layout</Label>
            <Select value={layoutKey} onValueChange={(v) => setLayoutKey(v as PriceTagConfig["layout"])} disabled={isThermal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRICE_TAG_LAYOUTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tag width (mm)</Label>
            <Input type="number" min={20} max={isThermal ? THERMAL_80_PRINTABLE_MM : 210} value={widthMm} onChange={(e) => setWidthMm(Number(e.target.value) || 1)} />
          </div>
          <div>
            <Label>Tag height (mm)</Label>
            <Input type="number" min={10} max={150} value={heightMm} onChange={(e) => setHeightMm(Number(e.target.value) || 1)} />
          </div>
          <div>
            <Label>Copies per item</Label>
            <Input type="number" min={1} max={50} value={copiesPerItem} onChange={(e) => setCopiesPerItem(Number(e.target.value) || 1)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Design and defaults can be customized in Settings → Customization.
        </p>

        <div className="border rounded-md p-3 max-h-[50vh] overflow-auto bg-muted/30">
          <div id="print-tags-sheet">
            <div className="sheet" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${isThermal ? `${effWidth}mm` : "minmax(0, 1fr)"})`, gap: `${gap}mm` }}>
              {expanded.map((it, i) => (
                <div
                  key={i}
                  className="tag"
                  style={{
                    border: borderCss,
                    borderRadius: 4,
                    padding: `${pad}mm`,
                    background: cfg.backgroundColor,
                    fontFamily: cfg.fontFamily,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    width: `${effWidth}mm`,
                    minHeight: `${heightMm}mm`,
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >

                  <div>
                    {cfg.showBusinessName && business?.name && (
                      <div style={{ fontSize: 10, color: "#64748b", textAlign: cfg.businessNameAlign }}>{business.name}</div>
                    )}
                    {cfg.showProductName && (
                      <div style={{ fontWeight: 600, fontSize: cfg.nameFontSize, lineHeight: 1.2, textAlign: cfg.nameAlign }}>{it.name}</div>
                    )}
                    {cfg.showSku && it.sku && (
                      <div style={{ fontSize: 10, color: "#64748b", textAlign: cfg.metaAlign }}>SKU: {it.sku}</div>
                    )}
                    {cfg.showBatch && it.batch_number && (
                      <div style={{ fontSize: 10, color: "#334155", textAlign: cfg.metaAlign }}>
                        Batch: {it.batch_number}{it.expiry_date ? ` · Exp ${new Date(it.expiry_date).toLocaleDateString()}` : ""}
                      </div>
                    )}
                  </div>
                  {cfg.showBarcode && <BarcodeSvg value={it.barcode || it.sku || it.id} />}
                  {cfg.showPrice && (
                    <div style={{ fontWeight: 700, fontSize: cfg.priceFontSize, color: cfg.priceColor, textAlign: cfg.priceAlign }}>
                      {formatPrice(Number(it.selling_price))}
                    </div>
                  )}
                  {cfg.footerText && (
                    <div style={{ fontSize: 9, color: "#64748b", textAlign: cfg.footerAlign }}>{cfg.footerText}</div>
                  )}

                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePrint}><Printer className="h-4 w-4 mr-2" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
