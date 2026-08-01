import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Camera, Check, Loader2, ScanBarcode, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/hooks/useProducts";
import BarcodeScanner from "@/components/BarcodeScanner";
import { parseBarcode } from "@/lib/barcodeScan";

/**
 * Barcode mapping screen: assign or update the barcode of every product so
 * future POS scans always resolve. Supports scan-to-fill on the active row.
 */
export default function BarcodeMapping() {
  const { productsQuery } = useProducts();
  const products = productsQuery.data ?? [];

  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const activeRow = useRef<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        const barcode = ((p as any).barcode || "").trim();
        if (onlyMissing && barcode) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q) ||
          barcode.toLowerCase().includes(q)
        );
      })
      .slice(0, 500);
  }, [products, search, onlyMissing]);

  const missingCount = products.filter((p) => !((p as any).barcode || "").trim()).length;

  const valueFor = (p: any) => drafts[p.id] ?? (p.barcode || "");

  const save = async (p: any) => {
    const next = (drafts[p.id] ?? "").trim();
    if (next === (p.barcode || "")) return;
    const clash = products.find((o: any) => o.id !== p.id && (o.barcode || "") === next && next);
    if (clash) {
      toast.error(`${next} is already used by "${clash.name}"`);
      return;
    }
    setSavingId(p.id);
    try {
      const { error } = await supabase
        .from("products")
        .update({ barcode: next || null })
        .eq("id", p.id);
      if (error) throw error;
      setDrafts((d) => { const n = { ...d }; delete n[p.id]; return n; });
      await productsQuery.refetch();
      toast.success(`Barcode saved for ${p.name}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not save barcode");
    } finally {
      setSavingId(null);
    }
  };

  const applyScan = (raw: string) => {
    const code = parseBarcode(raw).raw;
    const id = activeRow.current;
    if (!id) {
      setSearch(code);
      return;
    }
    setDrafts((d) => ({ ...d, [id]: code }));
  };

  return (
    <div className="space-y-4">
      <div className="flex h-14 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Barcode Mapping</h1>
          <p className="text-sm text-muted-foreground">
            Assign or update the barcode on each product so scans always resolve.
          </p>
        </div>
        <Badge variant={missingCount ? "destructive" : "secondary"}>
          {missingCount} without barcode
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanBarcode className="h-4 w-4" /> Products
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, SKU or barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="onlyMissing" checked={onlyMissing} onCheckedChange={setOnlyMissing} />
              <Label htmlFor="onlyMissing" className="text-sm">Only missing barcodes</Label>
            </div>
            <Button variant="outline" onClick={() => setCameraOpen(true)}>
              <Camera className="mr-2 h-4 w-4" /> Scan with camera
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell">SKU</TableHead>
                  <TableHead className="w-[260px]">Barcode</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsQuery.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No products found.</TableCell></TableRow>
                ) : rows.map((p: any) => {
                  const dirty = drafts[p.id] !== undefined && drafts[p.id] !== (p.barcode || "");
                  return (
                    <TableRow key={p.id} className="odd:bg-muted/40">
                      <TableCell className="py-1.5 text-sm font-medium">{p.name}</TableCell>
                      <TableCell className="hidden py-1.5 text-xs text-muted-foreground md:table-cell">{p.sku || "—"}</TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          className="h-8 font-mono text-sm"
                          value={valueFor(p)}
                          placeholder="Scan or type…"
                          onFocus={() => { activeRow.current = p.id; }}
                          onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(p); } }}
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Button
                          size="sm" variant={dirty ? "default" : "ghost"}
                          disabled={!dirty || savingId === p.id}
                          onClick={() => save(p)}
                        >
                          {savingId === p.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Check className="h-3.5 w-3.5" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: click a barcode field, then pull the trigger on your scanner — the code fills that row. Press Enter to save.
          </p>
        </CardContent>
      </Card>

      <BarcodeScanner
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onDetected={(code) => { setCameraOpen(false); applyScan(code); }}
      />
    </div>
  );
}
