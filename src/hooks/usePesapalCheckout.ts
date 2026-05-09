import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CheckoutOptions {
  packageId: string;
  interval: "monthly" | "yearly";
  callbackUrl?: string;
}

export function usePesapalCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (opts: CheckoutOptions) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pesapal-initialize", {
        body: {
          packageId: opts.packageId,
          interval: opts.interval,
          callbackUrl:
            opts.callbackUrl ||
            `${window.location.origin}/settings?tab=subscription&checkout=success`,
        },
      });

      if (error || !data?.redirect_url) {
        throw new Error(error?.message || data?.error || "Could not start Pesapal checkout");
      }
      window.location.href = data.redirect_url;
    } catch (e: any) {
      toast.error(e.message || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
