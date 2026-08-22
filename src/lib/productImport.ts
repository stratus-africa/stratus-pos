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
};

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
