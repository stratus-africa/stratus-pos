import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Product } from "@/hooks/useProducts";
import { pickFefoBatches } from "@/hooks/useProductBatches";

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number;
}

export interface HeldSale {
  id: string;
  label: string;
  cart: CartItem[];
  customerId: string | null;
  customerName: string | null;
  createdAt: Date;
}

export interface PaymentEntry {
  method: "cash" | "mpesa" | "card";
  amount: number;
  reference: string;
}

export function usePOS() {
  const { business, currentLocation } = useBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [processing, setProcessing] = useState(false);

  const preventOverselling = (business as { prevent_overselling?: boolean } | null)?.prevent_overselling === true;

  // Read cached inventory to enforce stock limits without an extra fetch.
  const inventoryRows = (queryClient.getQueryData<{ product_id: string; quantity: number }[]>(
    ["inventory", currentLocation?.id]
  ) || []);
  const stockOf = (productId: string) => {
    const row = inventoryRows.find((r) => r.product_id === productId);
    return row ? Number(row.quantity) : 0;
  };

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      const newQty = existing ? existing.quantity + 1 : 1;
      if (preventOverselling) {
        const available = stockOf(product.id);
        if (newQty > available) {
          toast.error(`Only ${available} ${product.name} in stock`);
          return prev;
        }
      }
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: newQty } : i
        );
      }
      return [...prev, { product, quantity: 1, unit_price: product.selling_price, discount: 0 }];
    });
  }, [preventOverselling, inventoryRows]);

  const updateCartItem = useCallback((productId: string, updates: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const next = { ...i, ...updates };
        if (preventOverselling && updates.quantity !== undefined) {
          const available = stockOf(productId);
          if (next.quantity > available) {
            toast.error(`Only ${available} ${i.product.name} in stock`);
            return { ...i, quantity: available };
          }
        }
        // Decimal handling: if product disallows decimals, round down.
        if (!i.product.allow_decimal_quantity && updates.quantity !== undefined) {
          next.quantity = Math.floor(next.quantity);
        }
        return next;
      })
    );
  }, [preventOverselling, inventoryRows]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerId(null);
    setCustomerName(null);
  }, []);

  const cartSubtotal = cart.reduce((sum, i) => sum + i.unit_price * i.quantity - i.discount, 0);
  const vatEnabled = (business as { vat_enabled?: boolean } | null)?.vat_enabled ?? true;
  const cartTax = vatEnabled
    ? cart.reduce((sum, i) => {
        const lineTotal = i.unit_price * i.quantity - i.discount;
        const rate = (i.product.tax_rate ?? business?.tax_rate ?? 16) / 100;
        return sum + (lineTotal * rate) / (1 + rate);
      }, 0)
    : 0;
  const cartTotal = cartSubtotal;

  // Hold current sale
  const holdSale = useCallback(() => {
    if (cart.length === 0) return;
    const held: HeldSale = {
      id: crypto.randomUUID(),
      label: customerName || `Sale #${heldSales.length + 1}`,
      cart: [...cart],
      customerId,
      customerName,
      createdAt: new Date(),
    };
    setHeldSales((prev) => [...prev, held]);
    clearCart();
    toast.info("Sale held");
  }, [cart, customerId, customerName, heldSales.length, clearCart]);

  // Resume a held sale
  const resumeSale = useCallback((id: string) => {
    const held = heldSales.find((h) => h.id === id);
    if (!held) return;
    // If current cart has items, hold it first
    if (cart.length > 0) holdSale();
    setCart(held.cart);
    setCustomerId(held.customerId);
    setCustomerName(held.customerName);
    setHeldSales((prev) => prev.filter((h) => h.id !== id));
  }, [heldSales, cart, holdSale]);

  const removeHeldSale = useCallback((id: string) => {
    setHeldSales((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // Complete sale
  const completeSale = async (payments: PaymentEntry[], bankAccountId?: string | null) => {
    if (!business || !currentLocation || !user || cart.length === 0) return null;

    // Server-of-truth stock check before committing if overselling is disallowed.
    if (preventOverselling) {
      const productIds = cart.map((i) => i.product.id);
      const { data: stockRows } = await supabase
        .from("inventory")
        .select("product_id, quantity")
        .eq("location_id", currentLocation.id)
        .in("product_id", productIds);
      const stockMap = new Map((stockRows || []).map((r) => [r.product_id, Number(r.quantity)]));
      for (const item of cart) {
        const available = stockMap.get(item.product.id) ?? 0;
        if (item.quantity > available) {
          toast.error(`Cannot sell ${item.quantity} of ${item.product.name} — only ${available} in stock`);
          return null;
        }
      }
    }

    try {
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
      const paymentStatus = totalPaid >= cartTotal ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

      const saleId = crypto.randomUUID();

      // Create sale
      const { error: saleErr } = await supabase.from("sales").insert({
        id: saleId,
        business_id: business.id,
        location_id: currentLocation.id,
        customer_id: customerId,
        invoice_number: invoiceNumber,
        subtotal: cartSubtotal,
        tax: Math.round(cartTax * 100) / 100,
        discount: cart.reduce((s, i) => s + i.discount, 0),
        total: cartTotal,
        payment_status: paymentStatus,
        status: "final",
        created_by: user.id,
      });
      if (saleErr) throw saleErr;

      // Insert sale items — for pharmacy businesses, FEFO-pick a batch per line.
      const isPharmacy = (business as any)?.business_type === "pharmacy";
      const saleItems: any[] = [];
      const batchDeductions: { batch_id: string; quantity: number }[] = [];

      for (const i of cart) {
        let batchId: string | null = null;
        if (isPharmacy) {
          const picks = await pickFefoBatches(i.product.id, currentLocation.id, i.quantity);
          // Use the earliest-expiry batch as the line's batch_id; track all picks for deduction.
          if (picks.length > 0) batchId = picks[0].batch_id;
          batchDeductions.push(...picks);
        }
        saleItems.push({
          sale_id: saleId,
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          total: i.unit_price * i.quantity - i.discount,
          batch_id: batchId,
        });
      }
      const { error: itemsErr } = await supabase.from("sale_items").insert(saleItems);
      if (itemsErr) throw itemsErr;

      // Decrement batch quantities (FEFO)
      if (batchDeductions.length > 0) {
        await Promise.all(
          batchDeductions.map((p) =>
            supabase.rpc("decrement_batch_quantity" as any, { _batch_id: p.batch_id, _qty: p.quantity })
          )
        );
      }

      // Insert payments
      if (payments.length > 0) {
        const paymentRows = payments.filter((p) => p.amount > 0).map((p) => ({
          sale_id: saleId,
          method: p.method,
          amount: p.amount,
          reference: p.reference || null,
        }));
        if (paymentRows.length > 0) {
          const { error: payErr } = await supabase.from("payments").insert(paymentRows);
          if (payErr) throw payErr;
        }
      }

      // Batch deduct inventory and create adjustments
      const inventoryUpdates = await Promise.all(
        cart.map(async (item) => {
          const { data: inv } = await supabase
            .from("inventory")
            .select("id, quantity")
            .eq("product_id", item.product.id)
            .eq("location_id", currentLocation.id)
            .maybeSingle();
          return { item, inv };
        })
      );

      // Update inventory quantities
      await Promise.all(
        inventoryUpdates
          .filter(({ inv }) => inv)
          .map(({ item, inv }) =>
            supabase
              .from("inventory")
              .update({ quantity: inv!.quantity - item.quantity })
              .eq("id", inv!.id)
          )
      );

      // Batch insert stock adjustments
      const adjustments = cart.map((item) => ({
        product_id: item.product.id,
        location_id: currentLocation.id,
        quantity_change: -item.quantity,
        reason: "sale",
        notes: `Sale ${invoiceNumber}`,
        created_by: user.id,
      }));
      await supabase.from("stock_adjustments").insert(adjustments);

      // Auto-create linked bank transaction for the sale
      if (bankAccountId) {
        const { error: btErr } = await supabase.from("bank_transactions").insert({
          business_id: business.id,
          bank_account_id: bankAccountId,
          type: "payment_received",
          amount: Math.min(totalPaid, cartTotal),
          date: new Date().toISOString().split("T")[0],
          reference: invoiceNumber,
          description: `Sale ${invoiceNumber}`,
          category: "Sales",
          contact_name: customerName || null,
          sale_id: saleId,
          created_by: user.id,
        });
        if (btErr) console.error("Bank txn error:", btErr);

        // Update account balance
        const { data: acc } = await supabase.from("bank_accounts").select("balance").eq("id", bankAccountId).single();
        if (acc) {
          await supabase.from("bank_accounts").update({ balance: acc.balance + Math.min(totalPaid, cartTotal) }).eq("id", bankAccountId);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });

      const result = {
        saleId,
        invoiceNumber,
        items: cart,
        subtotal: cartSubtotal,
        tax: Math.round(cartTax * 100) / 100,
        discount: cart.reduce((s, i) => s + i.discount, 0),
        total: cartTotal,
        payments,
        totalPaid,
        change: Math.max(0, totalPaid - cartTotal),
        customerName,
        locationName: currentLocation.name,
        businessName: business.name,
        date: new Date(),
      };

      clearCart();
      toast.success("Sale completed!");
      return result;
    } catch (err: any) {
      toast.error(err.message);
      return null;
    } finally {
      setProcessing(false);
    }
  };

  return {
    cart, addToCart, updateCartItem, removeFromCart, clearCart,
    customerId, setCustomerId, customerName, setCustomerName,
    cartSubtotal, cartTax, cartTotal,
    heldSales, holdSale, resumeSale, removeHeldSale,
    completeSale, processing,
  };
}
