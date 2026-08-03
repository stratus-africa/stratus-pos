import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { handlePlanLimitError } from "@/lib/planLimits";

/** Fields tracked in the item history timeline. */
const PRODUCT_AUDIT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "purchase_price", label: "Purchase price" },
  { key: "selling_price", label: "Selling price" },
  { key: "tax_rate", label: "Tax rate" },
  { key: "category_id", label: "Category" },
  { key: "brand_id", label: "Brand" },
  { key: "unit_id", label: "Unit" },
  { key: "is_active", label: "Active" },
  { key: "allow_decimal_quantity", label: "Decimal quantity" },
  { key: "image_url", label: "Image" },
  { key: "kra_item_code", label: "KRA item code" },
  { key: "tax_category", label: "Tax category" },
  { key: "purchase_account_id", label: "Purchase account" },
  { key: "sales_account_id", label: "Sales account" },
  { key: "inventory_account_id", label: "Inventory account" },
];


export interface Product {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  purchase_price: number;
  selling_price: number;
  tax_rate: number | null;
  image_url: string | null;
  is_active: boolean;
  allow_decimal_quantity?: boolean;
  created_at: string;
  kra_item_code?: string | null;
  item_classification?: string | null;
  quantity_unit?: string | null;
  packaging_unit?: string | null;
  hs_code?: string | null;
  country_of_origin?: string | null;
  tax_category?: string | null;
  opening_stock_quantity?: number;
  opening_stock_value?: number;
  opening_stock_date?: string | null;
  purchase_account_id?: string | null;
  sales_account_id?: string | null;
  inventory_account_id?: string | null;

  categories?: { name: string } | null;
  brands?: { name: string } | null;
  units?: { name: string; abbreviation: string | null } | null;
}

export interface ProductInitialBatch {
  batch_number: string;
  expiry_date: string | null;
  manufacture_date?: string | null;
  quantity: number;
  unit_cost?: number;
  location_id?: string | null;
}

export interface ProductVariantInput {
  id?: string;
  color: string | null;
  size: string | null;
  sku?: string | null;
  barcode?: string | null;
  purchase_price?: number;
  selling_price?: number;
  image_url?: string | null;
  is_active?: boolean;
}

export interface ProductFormData {
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string | null;
  brand_id?: string | null;
  unit_id?: string | null;
  purchase_price: number;
  selling_price: number;
  tax_rate?: number;
  is_active?: boolean;
  allow_decimal_quantity?: boolean;
  image_url?: string | null;
  kra_item_code?: string | null;
  item_classification?: string | null;
  quantity_unit?: string | null;
  packaging_unit?: string | null;
  hs_code?: string | null;
  country_of_origin?: string | null;
  tax_category?: string | null;
  /** Cost of Goods Sold account debited when this product is sold. */
  purchase_account_id?: string | null;
  /** Revenue account credited when this product is sold. */
  sales_account_id?: string | null;
  /** Asset account used to track this product's stock value. */
  inventory_account_id?: string | null;

  opening_stock_quantity?: number;
  opening_stock_value?: number;
  opening_stock_date?: string | null;
  /** Location the opening stock quantity is booked to (create only, not a product column) */
  opening_stock_location_id?: string | null;
  initial_batches?: ProductInitialBatch[];
  variants?: ProductVariantInput[];
}


export function useProducts() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ["products", business?.id],
    queryFn: async () => {
      if (!business) return [];
      // Page through the dataset to bypass PostgREST's default 1000-row cap.
      const PAGE = 1000;
      const all: Product[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("*, categories(name), brands(name), units(name, abbreviation)")
          .eq("business_id", business.id)
          .order("name")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as Product[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    enabled: !!business,
  });

  const createProduct = useMutation({
    mutationFn: async (form: ProductFormData) => {
      if (!business) throw new Error("No business");
      const { initial_batches, variants, opening_stock_location_id, ...productData } = form;
      const { data: created, error } = await supabase
        .from("products")
        .insert({ ...productData, business_id: business.id })
        .select("id")
        .single();
      if (error) throw error;
      // Seed opening stock into inventory at the chosen location
      const openingQty = Number(productData.opening_stock_quantity || 0);
      const openingLocation = opening_stock_location_id || null;
      if (created?.id && openingQty > 0 && openingLocation) {
        const { error: invErr } = await supabase
          .from("inventory")
          .insert({ product_id: created.id, location_id: openingLocation, quantity: openingQty });
        if (invErr) throw invErr;
        const { data: auth } = await supabase.auth.getUser();
        await supabase.from("stock_adjustments").insert({
          product_id: created.id,
          location_id: openingLocation,
          quantity_change: openingQty,
          reason: "Opening stock",
          notes: productData.opening_stock_date ? `Opening stock as at ${productData.opening_stock_date}` : "Opening stock",
          created_by: auth.user?.id as string,
        });
      }

      if (initial_batches && initial_batches.length > 0 && created?.id) {
        const rows = initial_batches
          .filter((b) => b.batch_number.trim().length > 0)
          .map((b) => ({
            business_id: business.id,
            product_id: created.id,
            location_id: b.location_id || null,
            batch_number: b.batch_number.trim(),
            manufacture_date: b.manufacture_date || null,
            expiry_date: b.expiry_date || null,
            quantity: b.quantity || 0,
            unit_cost: b.unit_cost ?? productData.purchase_price ?? 0,
            is_active: true,
          }));
        if (rows.length > 0) {
          const { error: bErr } = await supabase.from("product_batches" as any).insert(rows as any);
          if (bErr) throw bErr;
        }
      }
      if (variants && variants.length > 0 && created?.id) {
        const vRows = variants
          .filter((v) => (v.color && v.color.trim()) || (v.size && v.size.trim()))
          .map((v) => ({
            business_id: business.id,
            product_id: created.id,
            color: v.color?.trim() || null,
            size: v.size?.trim() || null,
            sku: v.sku?.trim() || null,
            barcode: v.barcode?.trim() || null,
            purchase_price: v.purchase_price ?? productData.purchase_price ?? 0,
            selling_price: v.selling_price ?? productData.selling_price ?? 0,
            image_url: v.image_url || null,
            is_active: v.is_active ?? true,
          }));
        if (vRows.length > 0) {
          const { error: vErr } = await supabase.from("product_variants" as any).insert(vRows as any);
          if (vErr) throw vErr;
        }
      }
      if (created?.id) {
        const { logAudit } = await import("@/lib/audit");
        await logAudit({
          business_id: business.id,
          action: "product_created",
          entity_type: "product",
          entity_id: created.id,
          description: `Created item ${productData.name} (buy ${productData.purchase_price}, sell ${productData.selling_price})`,
          metadata: { product_name: productData.name },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      queryClient.invalidateQueries({ queryKey: ["product_variants"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      toast.success("Product created");
    },
    onError: (e) => { if (!handlePlanLimitError(e, "products")) toast.error(e.message); },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, initial_batches: _ib, variants, opening_stock_location_id: _ol, ...form }: ProductFormData & { id: string }) => {
      if (!business) throw new Error("No business");
      // Snapshot the previous values so the change can be written to the item history.
      const { data: before } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("products").update(form).eq("id", id);
      if (error) throw error;
      if (variants) {
        // Replace strategy: delete existing then re-insert the provided set
        const { error: delErr } = await supabase.from("product_variants" as any).delete().eq("product_id", id);
        if (delErr) throw delErr;
        const vRows = variants
          .filter((v) => (v.color && v.color.trim()) || (v.size && v.size.trim()))
          .map((v) => ({
            business_id: business.id,
            product_id: id,
            color: v.color?.trim() || null,
            size: v.size?.trim() || null,
            sku: v.sku?.trim() || null,
            barcode: v.barcode?.trim() || null,
            purchase_price: v.purchase_price ?? form.purchase_price ?? 0,
            selling_price: v.selling_price ?? form.selling_price ?? 0,
            image_url: v.image_url || null,
            is_active: v.is_active ?? true,
          }));
        if (vRows.length > 0) {
          const { error: vErr } = await supabase.from("product_variants" as any).insert(vRows as any);
          if (vErr) throw vErr;
        }
      }

      const { diffFields, describeChanges, logAudit } = await import("@/lib/audit");
      const changes = diffFields(before as any, form as any, PRODUCT_AUDIT_FIELDS);
      if (changes.length > 0) {
        await logAudit({
          business_id: business.id,
          action: "product_updated",
          entity_type: "product",
          entity_id: id,
          description: describeChanges(changes),
          metadata: { changes, product_name: (form as any).name ?? (before as any)?.name },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_variants"] });
      queryClient.invalidateQueries({ queryKey: ["product-history"] });
      toast.success("Product updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await supabase.from("products").select("name").eq("id", id).maybeSingle();
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      if (business) {
        const { logAudit } = await import("@/lib/audit");
        await logAudit({
          business_id: business.id,
          action: "product_deleted",
          entity_type: "product",
          entity_id: id,
          description: `Deleted item ${(before as any)?.name || id}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted");
    },
    onError: (e) => toast.error(e.message),
  });


  return { productsQuery, createProduct, updateProduct, deleteProduct };
}

export function useCategories() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["categories", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("business_id", business.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!business,
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; color_code?: string | null }) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase
        .from("categories")
        .insert({ name: input.name, color_code: input.color_code ?? null, business_id: business.id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category created");
    },
    onError: (e) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; name: string; color_code?: string | null }) => {
      const { error } = await supabase
        .from("categories")
        .update({ name: input.name, color_code: input.color_code ?? null } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return { query, create, update, remove };
}

export function useBrands() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["brands", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .eq("business_id", business.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!business,
  });

  const create = useMutation({
    mutationFn: async (input: { name: string }) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase
        .from("brands")
        .insert({ name: input.name, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand created");
    },
    onError: (e) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabase.from("brands").update({ name: input.name }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return { query, create, update, remove };
}

export function useUnits() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["units", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .eq("business_id", business.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!business,
  });

  const create = useMutation({
    mutationFn: async ({ name, abbreviation }: { name: string; abbreviation?: string | null }) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase
        .from("units")
        .insert({ name, abbreviation: abbreviation || null, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      toast.success("Unit created");
    },
    onError: (e) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, name, abbreviation }: { id: string; name: string; abbreviation?: string | null }) => {
      const { error } = await supabase.from("units").update({ name, abbreviation: abbreviation || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      toast.success("Unit updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      toast.success("Unit deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return { query, create, update, remove };
}
