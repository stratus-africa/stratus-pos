import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadPaystackScript } from "@/lib/paystack";
import { toast } from "sonner";

interface CheckoutOptions {
  packageId: string;
  interval: "monthly" | "yearly";
  callbackUrl?: string;
}

export function usePaystackCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (opts: CheckoutOptions) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-initialize", {
        body: {
          packageId: opts.packageId,
          interval: opts.interval,
          callbackUrl:
            opts.callbackUrl ||
            `${window.location.origin}/settings?tab=subscription&checkout=success`,
        },
      });

      if (error || !data?.access_code) {
        throw new Error(error?.message || data?.error || "Could not start checkout");
      }

      // Try inline popup first
      try {
        await loadPaystackScript();
        if (window.PaystackPop) {
          const popup = new window.PaystackPop();
          popup.resumeTransaction(data.access_code);
          return;
        }
      } catch {
        // fall through to redirect
      }

      // Fallback: redirect to hosted checkout
      window.location.href = data.authorization_url;
    } catch (e: any) {
      toast.error(e.message || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
