// Paystack frontend helpers — popup checkout
declare global {
  interface Window {
    PaystackPop?: any;
  }
}

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;

let scriptLoading: Promise<void> | null = null;

export function getPaystackEnvironment(): "sandbox" | "live" {
  return PAYSTACK_PUBLIC_KEY?.startsWith("pk_test_") ? "sandbox" : "live";
}

export function loadPaystackScript(): Promise<void> {
  if (typeof window !== "undefined" && window.PaystackPop) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v2/inline.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Paystack script"));
    document.head.appendChild(s);
  });
  return scriptLoading;
}
