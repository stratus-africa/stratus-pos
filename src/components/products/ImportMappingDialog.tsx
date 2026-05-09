import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRight } from "lucide-react";

export type FieldKey =
  | "name" | "sku" | "barcode" | "category" | "brand" | "unit"
  | "purchase_price" | "selling_price" | "tax_rate" | "active";

export interface FieldDef { key: FieldKey; label: string; required?: boolean; }

export const PRODUCT_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "unit", label: "Unit" },
  { key: "purchase_price", label: "Purchase Price" },
  { key: "selling_price", label: "Selling Price" },
  { key: "tax_rate", label: "Tax Rate" },
  { key: "active", label: "Active" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  headers: string[];
  sampleRow?: Record<string, any>;
  importing?: boolean;
  onConfirm: (mapping: Record<FieldKey, string | null>) => void;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

export default function ImportMappingDialog({ open, onOpenChange, headers, sampleRow, importing, onConfirm }: Props) {
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({} as Record<FieldKey, string | null>);

  useEffect(() => {
    if (!open) return;
    const m: Record<FieldKey, string | null> = {} as any;
    PRODUCT_FIELDS.forEach((f) => {
      const target = norm(f.label);
      const match = headers.find((h) => norm(h) === target) ||
        headers.find((h) => norm(h).includes(target) || target.includes(norm(h)));
      m[f.key] = match || null;
    });
    setMapping(m);
  }, [open, headers]);

  const ready = useMemo(() => PRODUCT_FIELDS.every((f) => !f.required || mapping[f.key]), [mapping]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map Import Columns</DialogTitle>
          <DialogDescription>Match each product field to a column from your file.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {PRODUCT_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Label className="text-sm">
                {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={mapping[f.key] || "__none"}
                onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none" ? null : v }))}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="— Skip —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Skip —</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}{sampleRow && sampleRow[h] !== undefined ? ` (${String(sampleRow[h]).slice(0, 20)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={() => onConfirm(mapping)} disabled={!ready || importing}>
            {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
