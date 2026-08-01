import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, ScanBarcode, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MappableProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  selling_price?: number | null;
  is_active?: boolean | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The scanned code that matched nothing. */
  code: string;
  products: MappableProduct[];
  /** Called after the barcode is saved on the chosen product. */
  onAssigned: (product: MappableProduct) => void;
  /** Called when the user chooses to create a brand new product for this code. */
  onCreateNew: (code: string) => void;
}

/**
 * Shown when a scan doesn't resolve to a product: search the catalogue and
 * attach the code to the right item (so future scans always work), or create
 * a new product pre-filled with the scanned barcode.
 */
export default function UnknownBarcodeDialog({
  open, onOpenChange, code, products, onAssigned, onCreateNew,
}: Props) {
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => { if (open) setSearch(""); }, [open, code]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => p.is_active !== false);
    if (!q) return list.slice(0, 50);
    return list
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, search]);

  const assign = async (product: MappableProduct) => {
    if (savingId) return;
    const existing = (product.barcode || "").trim();
    if (existing && existing !== code) {
      const ok = window.confirm(
        `"${product.name}" already has barcode ${existing}. Replace it with ${code}?`,
      );
      if (!ok) return;
    }
    setSavingId(product.id);
    try {
      const { error } = await supabase.from("products").update({ barcode: code }).eq("id", product.id);
      if (error) throw error;
      toast.success(`${code} mapped to ${product.name}`);
      onAssigned({ ...product, barcode: code });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the barcode");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5" /> Unknown barcode
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono font-semibold">{code}</span> doesn&apos;t match any product.
            Attach it to an existing item or create a new product.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Search product by name, SKU or barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-72 rounded-md border">
          {results.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No products match your search.</p>
          ) : (
            <div className="divide-y">
              {results.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 odd:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.sku || "No SKU"}
                      {p.barcode ? <> · <span className="font-mono">{p.barcode}</span></> : (
                        <> · <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">No barcode</Badge></>
                      )}
                    </p>
                  </div>
                  <Button size="sm" disabled={!!savingId} onClick={() => assign(p)}>
                    {savingId === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Attach &amp; add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" onClick={() => { onOpenChange(false); onCreateNew(code); }}>
            <Plus className="mr-1 h-4 w-4" /> Create new product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
