export async function downloadProductOpeningStockTemplate() {
  const XLSX = await import("xlsx");

  const rows = [
    {
      "Product Name": "Maize Flour 2kg",
      SKU: "MF-2KG",
      Barcode: "",
      Category: "Flour",
      Brand: "",
      Unit: "Piece",
      "Purchase Price": 120,
      "Selling Price": 150,
      "Tax Rate": 16,
      "Opening Stock Quantity": 50,
      "Opening Stock Value": 6000,
      "Opening Stock Date": new Date().toISOString().slice(0, 10),
      "Reorder Level": 10,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 16 },
  ];

  const instructions = [
    ["StratusPOS Step 4 Product + Opening Stock Template", ""],
    ["Product Name", "Required. Product name."],
    ["SKU", "Recommended unique stock keeping unit."],
    ["Opening Stock Quantity", "Quantity currently on hand at the first location."],
    ["Opening Stock Value", "Total purchase value of the opening quantity."],
    ["Opening Stock Date", "Use YYYY-MM-DD. If blank, the onboarding default date is used."],
    ["Tax Rate", "Enter a percentage such as 16 for 16%."],
    ["Import", "Replace the example row with your products, then upload the file in Step 4 or Products → Data → Import file."],
  ];
  const info = XLSX.utils.aoa_to_sheet(instructions);
  info["!cols"] = [{ wch: 28 }, { wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.utils.book_append_sheet(wb, info, "Instructions");
  XLSX.writeFile(wb, "StratusPOS-Step-4-Product-Opening-Stock-Template.xlsx");
}
