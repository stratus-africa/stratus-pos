import { useState, useRef } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, Plus, Search, Pencil, Trash2, Tag, Layers, Ruler, Download, Upload, FileDown, Lock, ScanLine } from "lucide-react";
import { useProducts, useCategories, useBrands, useUnits, type ProductFormData, type Product } from "@/hooks/useProducts";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { QuickAddDialog } from "@/components/products/QuickAddDialog";
import ImportMappingDialog from "@/components/products/ImportMappingDialog";
import ProductDetailDialog from "@/components/products/ProductDetailDialog";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useFeatureLimit } from "@/components/FeatureGate";

const Products = () => {
  const { productsQuery, createProduct, updateProduct, deleteProduct } = useProducts();
  const { query: categoriesQuery, create: createCategory, remove: removeCategory } = useCategories();
  const { query: brandsQuery, create: createBrand, remove: removeBrand } = useBrands();
  const { query: unitsQuery, create: createUnit, remove: removeUnit } = useUnits();

  const { business } = useBusiness();
  const { maxProducts } = useFeatureLimit();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, any>[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [bulkUnitId, setBulkUnitId] = useState<string>("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0) return;
    if (!bulkCategoryId && !bulkUnitId) {
      toast.error("Pick a category or unit to apply");
      return;
    }
    setBulkUpdating(true);
    try {
      const update: { category_id?: string; unit_id?: string } = {};
      if (bulkCategoryId) update.category_id = bulkCategoryId;
      if (bulkUnitId) update.unit_id = bulkUnitId;
      const { error } = await supabase.from("products").update(update).in("id", Array.from(selectedIds));
      if (error) throw error;
      toast.success(`Updated ${selectedIds.size} products`);
      setBulkUpdateOpen(false);
      setBulkCategoryId("");
      setBulkUnitId("");
      setSelectedIds(new Set());
      productsQuery.refetch();
    } catch (err: any) {
      toast.error(`Bulk update failed: ${err.message}`);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleScanned = (code: string) => {
    setSearch(code);
    const match = products.find((p) => p.barcode === code || p.sku === code);
    if (match) {
      setDetailProduct(match);
    } else {
      toast.info(`No product found for "${code}". Search filtered.`);
    }
  };

  const products = productsQuery.data || [];
  const atProductLimit = maxProducts !== Infinity && products.length >= maxProducts;
  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
      (p.barcode && p.barcode.includes(search));
    const matchCategory = categoryFilter === "all" || p.category_id === categoryFilter;
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "active" && p.is_active) ||
      (statusFilter === "inactive" && !p.is_active);
    return matchSearch && matchCategory && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const allFilteredSelected = paged.length > 0 && paged.every((p) => selectedIds.has(p.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paged.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paged.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Deleted ${ids.length} products`);
      setSelectedIds(new Set());
      productsQuery.refetch();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleProductSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProduct.mutate({ ...data, id: editingProduct.id }, {
        onSuccess: () => { setProductDialogOpen(false); setEditingProduct(null); },
      });
    } else {
      createProduct.mutate(data, {
        onSuccess: () => setProductDialogOpen(false),
      });
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setProductDialogOpen(true);
  };

  const formatKES = (amount: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(amount);

  const downloadTemplate = () => {
    const sample = [
      { Name: "Maize Flour 2kg", SKU: "MF-2KG", Barcode: "6901234567890", Category: "Flour", Brand: "Jogoo", Unit: "Pieces", "Purchase Price": 120, "Selling Price": 150, "Tax Rate": 16, Active: "Yes" },
      { Name: "Sugar 1kg", SKU: "SG-1KG", Barcode: "6907654321098", Category: "Sugar", Brand: "Mumias", Unit: "Pieces", "Purchase Price": 140, "Selling Price": 180, "Tax Rate": 16, Active: "Yes" },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "product_import_template.csv", { bookType: "csv" });
    toast.success("Template downloaded");
  };

  const exportProducts = (format: "csv" | "xlsx") => {
    const data = products.map((p) => ({
      Name: p.name,
      SKU: p.sku || "",
      Barcode: p.barcode || "",
      Category: p.categories?.name || "",
      Brand: p.brands?.name || "",
      Unit: p.units?.name || "",
      "Purchase Price": p.purchase_price,
      "Selling Price": p.selling_price,
      "Tax Rate": p.tax_rate ?? "",
      Active: p.is_active ? "Yes" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, `products.${format}`, { bookType: format === "csv" ? "csv" : "xlsx" });
    toast.success(`Exported ${products.length} products as ${format.toUpperCase()}`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !business) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
      if (rows.length === 0) { toast.error("File is empty"); return; }
      setImportRows(rows);
      setImportHeaders(Object.keys(rows[0]));
      setMappingOpen(true);
    } catch (err: any) {
      toast.error(`Failed to read file: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runImport = async (mapping: Record<string, string | null>) => {
    if (!business) return;
    setImporting(true);
    try {
      const catMap = new Map((categoriesQuery.data || []).map((c) => [c.name.toLowerCase(), c.id]));
      const brandMap = new Map((brandsQuery.data || []).map((b) => [b.name.toLowerCase(), b.id]));
      const unitMap = new Map((unitsQuery.data || []).map((u) => [u.name.toLowerCase(), u.id]));
      const get = (row: Record<string, any>, k: string) => mapping[k] ? row[mapping[k] as string] : undefined;
      const toInsert = importRows.map((row) => ({
        business_id: business.id,
        name: String(get(row, "name") ?? "Unnamed"),
        sku: get(row, "sku") || null,
        barcode: get(row, "barcode") || null,
        category_id: catMap.get(String(get(row, "category") ?? "").toLowerCase()) || null,
        brand_id: brandMap.get(String(get(row, "brand") ?? "").toLowerCase()) || null,
        unit_id: unitMap.get(String(get(row, "unit") ?? "").toLowerCase()) || null,
        purchase_price: Number(get(row, "purchase_price") ?? 0),
        selling_price: Number(get(row, "selling_price") ?? 0),
        tax_rate: get(row, "tax_rate") != null && get(row, "tax_rate") !== "" ? Number(get(row, "tax_rate")) : 16,
        is_active: String(get(row, "active") ?? "Yes").toLowerCase() !== "no",
      }));
      const { error } = await supabase.from("products").insert(toInsert);
      if (error) throw error;
      toast.success(`Imported ${toInsert.length} products`);
      productsQuery.refetch();
      setMappingOpen(false);
      setImportRows([]);
      setImportHeaders([]);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button variant="outline" onClick={() => setScannerOpen(true)}>
            <ScanLine className="mr-2 h-4 w-4" /> Scan
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-2 h-4 w-4" /> {importing ? "Importing..." : "Import"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportProducts("csv")}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportProducts("xlsx")}>Export as Excel (.xlsx)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            onClick={() => { setEditingProduct(null); setProductDialogOpen(true); }}
            disabled={atProductLimit}
            title={atProductLimit ? `Product limit reached (${maxProducts}). Upgrade your plan.` : undefined}
          >
            {atProductLimit ? <Lock className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {atProductLimit ? `Limit (${maxProducts})` : "Add Product"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products"><Package className="mr-1 h-4 w-4" /> Products ({products.length})</TabsTrigger>
          <TabsTrigger value="categories"><Layers className="mr-1 h-4 w-4" /> Categories</TabsTrigger>
          <TabsTrigger value="brands"><Tag className="mr-1 h-4 w-4" /> Brands</TabsTrigger>
          <TabsTrigger value="units"><Ruler className="mr-1 h-4 w-4" /> Units</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by name, SKU, or barcode..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categoriesQuery.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 pt-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                  <Button size="sm" variant="outline" onClick={() => setBulkUpdateOpen(true)}>
                    <Pencil className="mr-1 h-4 w-4" /> Bulk Update
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" disabled={bulkDeleting}>
                        <Trash2 className="mr-1 h-4 w-4" /> {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size}`}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedIds.size} product{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. The selected products will be permanently removed from your inventory.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Buy Price</TableHead>
                    <TableHead className="text-right">Sell Price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        {products.length === 0 ? "No products yet. Add your first product!" : "No products match your filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((p) => {
                      const margin = p.purchase_price > 0
                        ? (((p.selling_price - p.purchase_price) / p.purchase_price) * 100).toFixed(0)
                        : "—";
                      return (
                        <TableRow key={p.id} className={selectedIds.has(p.id) ? "bg-muted/50" : ""}>
                          <TableCell>
                            <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                          </TableCell>
                          <TableCell className="font-medium">
                            <button
                              onClick={() => setDetailProduct(p)}
                              className="text-left hover:text-primary hover:underline"
                            >
                              {p.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{p.sku || "—"}</TableCell>
                          <TableCell>{p.categories?.name || "—"}</TableCell>
                          <TableCell className="text-right">{formatKES(p.purchase_price)}</TableCell>
                          <TableCell className="text-right font-medium">{formatKES(p.selling_price)}</TableCell>
                          <TableCell className="text-right">{margin}%</TableCell>
                          <TableCell>
                            <Badge variant={p.is_active ? "default" : "secondary"}>
                              {p.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => handleEdit(p)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete "{p.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>This action cannot be undone. This product will be permanently removed.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteProduct.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
            {filtered.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t flex-wrap">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page</span>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Prev</Button>
                  <span className="text-sm">Page {currentPage} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Categories</CardTitle>
              <Button size="sm" onClick={() => setCatDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add</Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {categoriesQuery.data?.map((c) => (
                  <Badge key={c.id} variant="outline" className="gap-1 py-1.5 px-3 text-sm">
                    {c.name}
                    <button onClick={() => removeCategory.mutate(c.id)} className="ml-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(!categoriesQuery.data || categoriesQuery.data.length === 0) && (
                  <p className="text-muted-foreground text-sm">No categories yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brands">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Brands</CardTitle>
              <Button size="sm" onClick={() => setBrandDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add</Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {brandsQuery.data?.map((b) => (
                  <Badge key={b.id} variant="outline" className="gap-1 py-1.5 px-3 text-sm">
                    {b.name}
                    <button onClick={() => removeBrand.mutate(b.id)} className="ml-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(!brandsQuery.data || brandsQuery.data.length === 0) && (
                  <p className="text-muted-foreground text-sm">No brands yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Units of Measure</CardTitle>
              <Button size="sm" onClick={() => setUnitDialogOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add</Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {unitsQuery.data?.map((u) => (
                  <Badge key={u.id} variant="outline" className="gap-1 py-1.5 px-3 text-sm">
                    {u.name}{u.abbreviation ? ` (${u.abbreviation})` : ""}
                    <button onClick={() => removeUnit.mutate(u.id)} className="ml-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(!unitsQuery.data || unitsQuery.data.length === 0) && (
                  <p className="text-muted-foreground text-sm">No units yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={(open) => { setProductDialogOpen(open); if (!open) setEditingProduct(null); }}
        onSubmit={handleProductSubmit}
        product={editingProduct}
        isLoading={createProduct.isPending || updateProduct.isPending}
      />

      <QuickAddDialog open={catDialogOpen} onOpenChange={setCatDialogOpen} title="Add Category" label="Category Name" onSubmit={(name) => createCategory.mutate(name)} isLoading={createCategory.isPending} />
      <QuickAddDialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen} title="Add Brand" label="Brand Name" onSubmit={(name) => createBrand.mutate(name)} isLoading={createBrand.isPending} />
      <QuickAddDialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen} title="Add Unit" label="Unit Name (e.g. Pieces)" onSubmit={(name) => createUnit.mutate({ name })} isLoading={createUnit.isPending} />

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={handleScanned} />
      <ProductDetailDialog
        product={detailProduct}
        open={!!detailProduct}
        onOpenChange={(o) => { if (!o) setDetailProduct(null); }}
      />

      {/* Bulk Update Dialog */}
      <AlertDialog open={bulkUpdateOpen} onOpenChange={setBulkUpdateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Update {selectedIds.size} product{selectedIds.size > 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Pick a Category and/or Unit to apply to all selected products. Leave a field empty to keep it unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
                <SelectTrigger><SelectValue placeholder="Keep unchanged" /></SelectTrigger>
                <SelectContent>
                  {categoriesQuery.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Unit</label>
              <Select value={bulkUnitId} onValueChange={setBulkUnitId}>
                <SelectTrigger><SelectValue placeholder="Keep unchanged" /></SelectTrigger>
                <SelectContent>
                  {unitsQuery.data?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}{u.abbreviation ? ` (${u.abbreviation})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkUpdate} disabled={bulkUpdating || (!bulkCategoryId && !bulkUnitId)}>
              {bulkUpdating ? "Updating..." : "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ImportMappingDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        headers={importHeaders}
        sampleRow={importRows[0]}
        importing={importing}
        onConfirm={(m) => runImport(m as Record<string, string | null>)}
      />
    </div>
  );
};

export default Products;
