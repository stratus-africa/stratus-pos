import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProducts } from "@/hooks/useProducts";
import { useBusiness } from "@/contexts/BusinessContext";
import { Progress } from "@/components/ui/progress";
import { Upload, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AdjustStockSubmit } from "./StockAdjustmentDialog";

const REASONS = ["Purchase received", "Damage", "Loss", "Correction", "Return", "Other"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AdjustStockSubmit) => void;
  isLoading?: boolean;
}

interface ParsedRow {
  raw: string;
  identifier: string;
  quantity: number;
  matchedBy: "barcode" | "sku" | "name" | null;
  product_id?: string;
  product_name?: string;
  error?: string;
}

/** Minimal CSV line splitter with quote support. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((c === "," || c === ";" || c === "\t") && !inQ) {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s: string) => s.trim().toLowerCase();

export function ImportAdjustmentsDialog({ open, onOpenChange, onSubmit, isLoading }: Props) {
  const { productsQuery } = useProducts();
  const { locations, currentLocation } = useBusiness();
  const [locationId, setLocationId] = useState(currentLocation?.id || "");
  const [reason, setReason] = useState("Correction");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const products = useMemo(() => productsQuery.data?.filter((p) => p.is_active) || [], [productsQuery.data]);

  const lookups = useMemo(() => {
    const byBarcode = new Map<string, { id: string; name: string }>();
    const bySku = new Map<string, { id: string; name: string }>();
    const byName = new Map<string, { id: string; name: string }>();
    products.forEach((p) => {
      const v = { id: p.id, name: p.name };
      if (p.barcode) byBarcode.set(norm(p.barcode), v);
      if (p.sku) bySku.set(norm(p.sku), v);
      byName.set(norm(p.name), v);
    });
    return { byBarcode, bySku, byName };
  }, [products]);

  const parseText = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) { toast.error("File is empty"); return; }

    let startIdx = 0;
    let idCol = 0;
    let qtyCol = 1;
    const header = splitCsvLine(lines[0]).map(norm);
    const looksHeader = header.some((h) => ["barcode", "item", "item name", "product", "product name", "name", "sku", "qty", "quantity", "quantity_change", "change"].includes(h));
    if (looksHeader) {
      startIdx = 1;
      const findCol = (names: string[]) => header.findIndex((h) => names.includes(h));
      const ic = findCol(["barcode", "sku", "item", "item name", "product", "product name", "name", "identifier"]);
      const qc = findCol(["qty", "quantity", "quantity_change", "change", "adjustment"]);
      if (ic >= 0) idCol = ic;
      if (qc >= 0) qtyCol = qc;
    }

    const parsed: ParsedRow[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i]);
      const identifier = (cells[idCol] || "").trim();
      const qtyRaw = (cells[qtyCol] || "").trim();
      if (!identifier && !qtyRaw) continue;
      const quantity = Number(qtyRaw.replace(/,/g, ""));
      const row: ParsedRow = { raw: lines[i], identifier, quantity, matchedBy: null };
      if (!identifier) row.error = "Missing barcode / item name";
      else if (!qtyRaw || Number.isNaN(quantity) || quantity === 0) row.error = "Invalid quantity";
      else {
        const key = norm(identifier);
        const hit = lookups.byBarcode.get(key) || lookups.bySku.get(key) || lookups.byName.get(key);
        if (!hit) row.error = "No matching product";
        else {
          row.product_id = hit.id;
          row.product_name = hit.name;
          row.matchedBy = lookups.byBarcode.has(key) ? "barcode" : lookups.bySku.has(key) ? "sku" : "name";
        }
      }
      parsed.push(row);
    }
    setRows(parsed);
    const ok = parsed.filter((r) => !r.error).length;
    toast.success(`Parsed ${parsed.length} row${parsed.length === 1 ? "" : "s"} — ${ok} matched`);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    parseText(text);
  };

  const downloadTemplate = () => {
    const csv = "barcode_or_item_name,quantity\n1234567890123,5\nBlue T-Shirt,-2\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "stock_adjustment_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const valid = rows.filter((r) => !r.error && r.product_id);
  const invalidCount = rows.length - valid.length;

  const reset = () => {
    setRows([]); setFileName(""); setNotes(""); setReference("");
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = () => {
    if (!locationId) { toast.error("Select a location"); return; }
    if (!valid.length) { toast.error("No valid rows to import"); return; }
    // Merge duplicates on the same product
    const merged = new Map<string, number>();
    valid.forEach((r) => merged.set(r.product_id!, (merged.get(r.product_id!) || 0) + r.quantity));
    const items = Array.from(merged.entries()).map(([product_id, quantity_change]) => ({ product_id, quantity_change }));
    setProgress({ done: 0, total: items.length });
    onSubmit({
      items,
      location_id: locationId,
      reason,
      notes: [reference ? `Ref: ${reference}` : "", notes].filter(Boolean).join(" — ") || undefined,
      onProgress: (done, total) => {
        setProgress({ done, total });
        if (done >= total) {
          setTimeout(() => { reset(); onOpenChange(false); }, 400);
        }
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Stock Adjustments</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.filter((r) => r !== "Purchase received").map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. IMP-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} />
            </div>
          </div>

          <div className="rounded-lg border border-dashed p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Choose CSV file
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" /> Template
              </Button>
              {fileName && <span className="text-sm text-muted-foreground flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{fileName}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Two columns: barcode (or SKU / item name) and quantity change. Positive adds stock, negative removes. Header row optional.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{valid.length} matched</Badge>
                {invalidCount > 0 && <Badge variant="destructive">{invalidCount} skipped</Badge>}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Input</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Matched by</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 500).map((r, i) => (
                      <TableRow key={i} className={r.error ? "opacity-60" : undefined}>
                        <TableCell className="font-mono text-xs">{r.identifier || "—"}</TableCell>
                        <TableCell>{r.product_name || <span className="text-destructive text-xs">{r.error}</span>}</TableCell>
                        <TableCell className="text-xs uppercase text-muted-foreground">{r.matchedBy || "—"}</TableCell>
                        <TableCell className="text-right">{Number.isNaN(r.quantity) ? "—" : r.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {rows.length > 500 && (
                <p className="text-xs text-muted-foreground">
                  Showing first 500 of {rows.length} rows — all {valid.length} matched rows will be imported.
                </p>
              )}
            </div>
          )}

          {progress && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importing adjustments…
                </span>
                <span className="tabular-nums">
                  {progress.done} / {progress.total} ({Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%)
                </span>
              </div>
              <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} className="h-2" />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!progress}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isLoading || !valid.length || !!progress}>
              {progress ? "Importing…" : `Import ${valid.length ? `${valid.length} line${valid.length === 1 ? "" : "s"}` : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
