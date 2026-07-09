import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Returns true when the product has appeared on a KRA-fiscalised sale. */
export function useIsProductFiscalised(productId?: string | null) {
  const q = useQuery({
    queryKey: ["is-product-fiscalised", productId],
    queryFn: async () => {
      if (!productId) return false;
      const { data, error } = await supabase.rpc("product_has_fiscalised_sales", { _product_id: productId });
      if (error) return false;
      return !!data;
    },
    enabled: !!productId,
    staleTime: 60_000,
  });
  return q.data === true;
}

/** Returns true when the customer has a KRA-fiscalised sale. */
export function useIsCustomerFiscalised(customerId?: string | null) {
  const q = useQuery({
    queryKey: ["is-customer-fiscalised", customerId],
    queryFn: async () => {
      if (!customerId) return false;
      const { data, error } = await supabase.rpc("customer_has_fiscalised_sales", { _customer_id: customerId });
      if (error) return false;
      return !!data;
    },
    enabled: !!customerId,
    staleTime: 60_000,
  });
  return q.data === true;
}
