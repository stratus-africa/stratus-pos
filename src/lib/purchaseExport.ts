import * as XLSX from "xlsx";
import { format } from "date-fns";

export interface PurchaseExportRow {
  created_at: string;
  invoice_number: string | null;
  id: string;
  suppliers?: { name: string } | null;
  locations?: { name: string } | null;
  subtotal: number;
  tax: number;
  total: number;
  payment_status: string;
  status: string;
  notes?: string | null;
}

export interface PurchaseExportLine {
  quantity: number;
  unit_cost: number;
  total: number;
  products?: { name: string | null; sku: string | null; barcode: string | null } | null;
}

function save(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

/** Export a list of purchases (one row per purchase) to .xlsx */
export function exportPurchasesToExcel(purchases: PurchaseExportRow[], filename?: string) {
  const rows = purchases.map((p) => ({
    Date: format(new Date(p.created_at), "yyyy-MM-dd"),
    "Invoice #": p.invoice_number || p.id.slice(0, 8),
    Supplier: p.suppliers?.name || "",
    Location: p.locations?.name || "",
    Subtotal: Number(p.subtotal || 0),
    VAT: Number(p.tax || 0),
    Total: Number(p.total || 0),
    Payment: p.payment_status,
    Status: p.status,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Purchases");
  save(wb, filename || `purchases-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}

/** Export a single purchase document (header + line items) to .xlsx */
export function exportPurchaseDocumentToExcel(
  purchase: PurchaseExportRow,
  items: PurchaseExportLine[],
  businessName?: string,
) {
  const ref = purchase.invoice_number || purchase.id.slice(0, 8);
  const aoa: (string | number)[][] = [
    [businessName || "Purchase Order"],
    ["Purchase", ref],
    ["Date", format(new Date(purchase.created_at), "yyyy-MM-dd")],
    ["Supplier", purchase.suppliers?.name || "—"],
    ["Location", purchase.locations?.name || "—"],
    ["Status", purchase.status],
    ["Payment", purchase.payment_status],
    [],
    ["#", "Item", "SKU", "Barcode", "Qty", "Unit cost", "Total"],
  ];

  items.forEach((i, idx) => {
    aoa.push([
      idx + 1,
      i.products?.name || "—",
      i.products?.sku || "",
      i.products?.barcode || "",
      Number(i.quantity || 0),
      Number(i.unit_cost || 0),
      Number(i.total || 0),
    ]);
  });

  aoa.push([]);
  aoa.push(["", "", "", "", "", "Subtotal", Number(purchase.subtotal || 0)]);
  aoa.push(["", "", "", "", "", "VAT", Number(purchase.tax || 0)]);
  aoa.push(["", "", "", "", "", "Total", Number(purchase.total || 0)]);
  if (purchase.notes) {
    aoa.push([]);
    aoa.push(["Notes", purchase.notes]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Purchase");
  save(wb, `purchase-${ref}.xlsx`);
}
