import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { assertCanPost } from "@/lib/postingGuard";

export type RecipeItemInput = { item_id: string; quantity: number; unit?: string | null; waste_percent: number };
export type RecipeInput = { id?: string; product_id: string; name: string; batch_size: number; production_unit: string; status: "active" | "inactive"; notes?: string | null; items: RecipeItemInput[] };

const db = supabase as any;

export function useBakery() {
  const { business } = useBusiness();
  const client = useQueryClient();
  const recipesQuery = useQuery({
    queryKey: ["bakery-recipes", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data, error } = await db.from("recipes").select("*, products(name, purchase_price, units(abbreviation)), recipe_items(*, products(name, purchase_price, units(abbreviation)))").eq("business_id", business!.id).order("name");
      if (error) throw error; return data || [];
    },
  });
  const productionsQuery = useQuery({
    queryKey: ["bakery-productions", business?.id], enabled: !!business,
    queryFn: async () => { const { data, error } = await db.from("productions").select("*, recipes(name, products(name)), locations(name), production_items(*, products(name, units(abbreviation)))").eq("business_id", business!.id).order("production_date", { ascending: false }).limit(100); if (error) throw error; return data || []; },
  });
  const saveRecipe = useMutation({
    mutationFn: async (input: RecipeInput) => {
      if (!business) throw new Error("No business context");
      const header = { product_id: input.product_id, name: input.name, batch_size: input.batch_size, production_unit: input.production_unit, status: input.status, notes: input.notes || null };
      let recipeId = input.id;
      if (recipeId) { const { error } = await db.from("recipes").update(header).eq("id", recipeId); if (error) throw error; const { error: del } = await db.from("recipe_items").delete().eq("recipe_id", recipeId); if (del) throw del; }
      else { const { data, error } = await db.from("recipes").insert({ ...header, business_id: business.id }).select("id").single(); if (error) throw error; recipeId = data.id; }
      const { error } = await db.from("recipe_items").insert(input.items.map((item) => ({ ...item, recipe_id: recipeId, unit: item.unit || null })));
      if (error) throw error;
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ["bakery-recipes"] }); toast.success("Recipe saved"); }, onError: (e: Error) => toast.error(e.message),
  });
  const completeProduction = useMutation({
    mutationFn: async (v: { recipe_id: string; location_id: string; date: string; quantity: number; notes?: string }) => { assertCanPost(); const { data, error } = await db.rpc("complete_production", { p_recipe_id: v.recipe_id, p_location_id: v.location_id, p_date: v.date, p_quantity: v.quantity, p_notes: v.notes || null }); if (error) throw error; return data as string; },
    onSuccess: () => { client.invalidateQueries({ queryKey: ["bakery-productions"] }); client.invalidateQueries({ queryKey: ["inventory"] }); toast.success("Production completed and stock updated"); }, onError: (e: Error) => toast.error(e.message),
  });
  const deleteRecipe = useMutation({
    mutationFn: async (id: string) => {
      const { error: itemsErr } = await db.from("recipe_items").delete().eq("recipe_id", id);
      if (itemsErr) throw itemsErr;
      const { error } = await db.from("recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { client.invalidateQueries({ queryKey: ["bakery-recipes"] }); toast.success("Recipe deleted"); }, onError: (e: Error) => toast.error(e.message),
  });
  return { recipesQuery, productionsQuery, saveRecipe, deleteRecipe, completeProduction };
}
