import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";

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
  categories?: { name: string } | null;
  brands?: { name: string } | null;
  units?: { name: string; abbreviation: string | null } | null;
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
}

export function useProducts() {
  const { business } = useBusiness();
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ["products", business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name), brands(name), units(name, abbreviation)")
        .eq("business_id", business.id)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!business,
  });

  const createProduct = useMutation({
    mutationFn: async (form: ProductFormData) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase
        .from("products")
        .insert({ ...form, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...form }: ProductFormData & { id: string }) => {
      const { error } = await supabase.from("products").update(form).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
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
    mutationFn: async (name: string) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase
        .from("categories")
        .insert({ name, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category created");
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

  return { query, create, remove };
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
    mutationFn: async (name: string) => {
      if (!business) throw new Error("No business");
      const { error } = await supabase
        .from("brands")
        .insert({ name, business_id: business.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      toast.success("Brand created");
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

  return { query, create, remove };
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
    mutationFn: async ({ name, abbreviation }: { name: string; abbreviation?: string }) => {
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

  return { query, create, remove };
}
