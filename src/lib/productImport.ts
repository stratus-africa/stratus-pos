export type ProductImportRow = {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  unit: string | null;
  purchase_price: number;
  selling_price: number;
  tax_rate: number;
  is_active: boolean;
  opening_stock_quantity: number;
  opening_stock_value: number;
  opening_stock_date: string | null;
};

function normalizeImportDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function mapProductImportRows(
  rows: Record<string, any>[],
  mapping: Record<string, string | null>,
): ProductImportRow[] {
  const get = (row: Record<string, any>, key: string) =>
    mapping[key] ? row[mapping[key] as string] : undefined;

  return rows.map((row) => ({
      name: String(get(row, "name") ?? "Unnamed").trim(),
      sku: get(row, "sku") ? String(get(row, "sku")).trim() : null,
      barcode: get(row, "barcode") ? String(get(row, "barcode")).trim() : null,
      category: get(row, "category") ? String(get(row, "category")).trim() : null,
      brand: get(row, "brand") ? String(get(row, "brand")).trim() : null,
      unit: get(row, "unit") ? String(get(row, "unit")).trim() : null,
      purchase_price: Number(get(row, "purchase_price") ?? 0) || 0,
      selling_price: Number(get(row, "selling_price") ?? 0) || 0,
      tax_rate:
        get(row, "tax_rate") != null && get(row, "tax_rate") !== ""
          ? Number(get(row, "tax_rate")) || 0
          : 16,
      is_active: String(get(row, "active") ?? "Yes").toLowerCase() !== "no",
      opening_stock_quantity: Number(get(row, "opening_stock_quantity") ?? 0) || 0,
      opening_stock_value: Number(get(row, "opening_stock_value") ?? 0) || 0,
      opening_stock_date: normalizeImportDate(get(row, "opening_stock_date")),
    }));
}

export async function parseProductImportFile(file: File) {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
  if (!rows.length) throw new Error("File is empty");
  return { rows, headers: Object.keys(rows[0]) };
}
