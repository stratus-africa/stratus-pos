import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadPaystackScript } from "@/lib/paystack";
import { paystackInitialize } from "@/lib/paystack.functions";
import { toast } from "sonner";

interface CheckoutOptions {
  packageId: string;
  interval: "monthly" | "yearly";
  callbackUrl?: string;
}

export function usePaystackCheckout() {
  const [loading, setLoading] = useState(false);
  const paystackInitializeFn = useServerFn(paystackInitialize);

  const openCheckout = async (opts: CheckoutOptions) => {
    setLoading(true);
    try {
      const data = await paystackInitializeFn({
        data: {
          packageId: opts.packageId,
          interval: opts.interval,
          callbackUrl:
            opts.callbackUrl ||
            `${window.location.origin}/settings?tab=subscription&checkout=success`,
        },
      });

      if (!data?.access_code) {
        throw new Error("Could not start checkout");
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
