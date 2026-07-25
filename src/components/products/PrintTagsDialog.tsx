import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/contexts/BusinessContext";
import { Printer } from "lucide-react";

export interface PrintTagItem {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  selling_price: number;
  /** Optional batch details for batch price tags. */
  batch_number?: string | null;
  expiry_date?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: PrintTagItem[];
}

const LAYOUTS: Record<string, { cols: number; rows: number; label: string }> = {
  "30": { cols: 3, rows: 10, label: "30 per page (3×10)" },
  "24": { cols: 3, rows: 8, label: "24 per page (3×8)" },
  "12": { cols: 2, rows: 6, label: "12 per page (2×6)" },
};

/** Renders a barcode SVG for the given value. Falls back to the SKU/name when no barcode is set. */
function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, margin: 0, height: 32, width: 1.4 });
    } catch {
      /* ignore invalid values */
    }
  }, [value]);
  return <svg ref={ref} className="w-full h-8" />;
}

export function PrintTagsDialog({ open, onOpenChange, items }: Props) {
  const { business } = useBusiness();
  const [layoutKey, setLayoutKey] = useState<keyof typeof LAYOUTS>("30");
  const [copiesPerItem, setCopiesPerItem] = useState(1);
  const currency = business?.currency || "KES";

  const layout = LAYOUTS[layoutKey];

  const expanded = useMemo(() => {
    const arr: PrintTagItem[] = [];
    const n = Math.max(1, Math.min(50, copiesPerItem));
    for (const it of items) for (let i = 0; i < n; i++) arr.push(it);
    return arr;
  }, [items, copiesPerItem]);

  const formatPrice = (v: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 2 }).format(v || 0);

  const handlePrint = () => {
    const node = document.getElementById("print-tags-sheet");
    if (!node) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Price tags</title>
      <style>
        @page { size: A4; margin: 8mm; }
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; }
        .sheet { display: grid; grid-template-columns: repeat(${layout.cols}, 1fr); gap: 4mm; }
        .tag { border: 1px dashed #cbd5e1; border-radius: 4px; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between; min-height: 70px; page-break-inside: avoid; }
        .tag .name { font-weight: 600; font-size: 12px; line-height: 1.2; }
        .tag .sku { font-size: 10px; color: #64748b; }
        .tag .price { font-weight: 700; font-size: 14px; }
        .tag .batch { font-size: 10px; color: #334155; }
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
            <Label>Layout</Label>
            <Select value={layoutKey} onValueChange={(v) => setLayoutKey(v as keyof typeof LAYOUTS)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LAYOUTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Copies per item</Label>
            <Input type="number" min={1} max={50} value={copiesPerItem} onChange={(e) => setCopiesPerItem(Number(e.target.value) || 1)} />
          </div>
        </div>

        <div className="border rounded-md p-3 max-h-[50vh] overflow-auto bg-muted/30">
          <div id="print-tags-sheet">
            <div className="sheet" style={{ display: "grid", gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: "4mm" }}>
              {expanded.map((it, i) => (
                <div key={i} className="tag" style={{ border: "1px dashed #cbd5e1", borderRadius: 4, padding: "6px 8px", background: "white" }}>
                  <div>
                    <div className="name" style={{ fontWeight: 600, fontSize: 12 }}>{it.name}</div>
                    {it.sku && <div className="sku" style={{ fontSize: 10, color: "#64748b" }}>SKU: {it.sku}</div>}
                    {it.batch_number && (
                      <div className="batch" style={{ fontSize: 10, color: "#334155" }}>
                        Batch: {it.batch_number}{it.expiry_date ? ` · Exp ${new Date(it.expiry_date).toLocaleDateString()}` : ""}
                      </div>
                    )}
                  </div>
                  <BarcodeSvg value={it.barcode || it.sku || it.id} />
                  <div className="price" style={{ fontWeight: 700, fontSize: 14 }}>{formatPrice(Number(it.selling_price))}</div>
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
