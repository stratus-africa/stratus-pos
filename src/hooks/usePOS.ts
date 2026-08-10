import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Product } from "@/hooks/useProducts";
import { pickFefoBatches } from "@/hooks/useProductBatches";
import { consumeNext } from "@/lib/numberSeries";
import { ensureCanPost } from "@/lib/postingGuard";
import { loadCartDraft, saveCartDraft, clearCartDraft } from "@/lib/cartPersistence";
import { enqueueSale, isOnline } from "@/lib/offlineSales";

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number;
  /** Optional per-line VAT rate override (tax_rates.id). If null/undefined, product/business default is used. */
  tax_rate_id?: string | null;
}

export interface VatBreakdownRow {
  rate: number; // percent (e.g. 16)
  label: string; // display label (e.g. "VAT 16%")
  taxable: number; // net (excl. VAT)
  vat: number; // VAT amount
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

/**
 * Converts tendered payments into the amounts that settle the sale. Cash is
 * applied after electronic payments, so any overpayment is treated as change
 * rather than as cash income. The original tendered amounts remain available
 * for the receipt/customer display.
 */
export function applyPaymentsToSaleTotal(payments: PaymentEntry[], total: number): PaymentEntry[] {
  let remaining = Math.max(0, Math.round(Number(total || 0) * 100) / 100);
  const applied = payments.map((payment) => ({
    ...payment,
    amount: Math.max(0, Math.round(Number(payment.amount || 0) * 100) / 100),
  }));

  // Electronic payments cannot be returned as till change, so settle them
  // first. Any remaining cash tender is then limited to the balance due.
  for (const method of ["mpesa", "card"] as const) {
    for (const payment of applied) {
      if (payment.method !== method) continue;
      const amount = Math.min(payment.amount, remaining);
      payment.amount = amount;
      remaining = Math.max(0, Math.round((remaining - amount) * 100) / 100);
    }
  }

  for (const payment of applied) {
    if (payment.method !== "cash") continue;
    const amount = Math.min(payment.amount, remaining);
    payment.amount = amount;
    remaining = Math.max(0, Math.round((remaining - amount) * 100) / 100);
  }

  return applied.filter((payment) => payment.amount > 0);
}

export function usePOS() {
  const { business, currentLocation } = useBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const completingRef = useRef(false);
  // A sale reserved (status = "pending") before an M-Pesa STK prompt is sent so
  // the Daraja callback can settle the correct sale. Finalising reuses this row
  // instead of inserting a second one.
  const pendingSaleRef = useRef<{ saleId: string; invoiceNumber: string; total: number } | null>(null);


  // Persisted suspended sales (DB-backed, scoped to business + location)
  const heldQuery = useQuery({
    queryKey: ["suspended_sales", business?.id, currentLocation?.id],
    queryFn: async (): Promise<HeldSale[]> => {
      if (!business || !currentLocation) return [];
      const { data, error } = await supabase
        .from("suspended_sales")
        .select("*")
        .eq("business_id", business.id)
        .eq("location_id", currentLocation.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        label: r.label,
        cart: (r.cart as CartItem[]) || [],
        customerId: r.customer_id,
        customerName: r.customer_name,
        createdAt: new Date(r.created_at),
      }));
    },
    enabled: !!business && !!currentLocation,
  });
  const heldSales: HeldSale[] = heldQuery.data || [];

  const preventOverselling = (business as { prevent_overselling?: boolean } | null)?.prevent_overselling === true;

  // Stock at the selected location. Loaded regardless of the overselling rule so
  // the cart can show live "exceeds available stock" warnings.
  const inventoryQuery = useQuery({
    queryKey: ["inventory", "pos", business?.id, currentLocation?.id],
    queryFn: async () => {
      if (!business || !currentLocation) return [] as { product_id: string; quantity: number }[];
      const { data, error } = await supabase
        .from("inventory")
        .select("product_id, quantity")
        .eq("location_id", currentLocation.id);
      if (error) throw error;
      return (data || []) as { product_id: string; quantity: number }[];
    },
    enabled: !!business && !!currentLocation,
    refetchInterval: 60_000,
  });
  const inventoryRows = inventoryQuery.data || [];
  const stockOf = useCallback(
    (productId: string) => {
      const row = inventoryRows.find((r) => r.product_id === productId);
      return row ? Number(row.quantity) : 0;
    },
    [inventoryRows],
  );

  const addToCart = useCallback(
    (product: Product) => {
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
          return prev.map((i) => (i.product.id === product.id ? { ...i, quantity: newQty } : i));
        }
        return [...prev, { product, quantity: 1, unit_price: product.selling_price, discount: 0 }];
      });
    },
    [preventOverselling, inventoryRows],
  );

  const updateCartItem = useCallback(
    (productId: string, updates: Partial<CartItem>) => {
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
          if (!i.product.allow_decimal_quantity && updates.quantity !== undefined) {
            next.quantity = Math.floor(next.quantity);
          }
          return next;
        }),
      );
    },
    [preventOverselling, inventoryRows],
  );

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const draftIds = {
    businessId: business?.id ?? null,
    locationId: currentLocation?.id ?? null,
    userId: user?.id ?? null,
  };

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerId(null);
    setCustomerName(null);
    clearCartDraft({
      businessId: business?.id ?? null,
      locationId: currentLocation?.id ?? null,
      userId: user?.id ?? null,
    });
  }, [business?.id, currentLocation?.id, user?.id]);

  // --- Cart persistence ------------------------------------------------------
  // Restore any in-progress cart once per business/location/user combination,
  // then keep the stored copy in sync with every change.
  const restoredFor = useRef<string>("");
  useEffect(() => {
    if (!business?.id || !currentLocation?.id || !user?.id) return;
    const sig = `${business.id}:${currentLocation.id}:${user.id}`;
    if (restoredFor.current === sig) return;
    restoredFor.current = sig;
    const draft = loadCartDraft(draftIds);
    if (draft && draft.cart.length > 0) {
      setCart(draft.cart);
      setCustomerId(draft.customerId);
      setCustomerName(draft.customerName);
      toast.info(`Restored your in-progress cart (${draft.cart.length} item${draft.cart.length > 1 ? "s" : ""})`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, currentLocation?.id, user?.id]);

  useEffect(() => {
    if (!business?.id || !currentLocation?.id || !user?.id) return;
    saveCartDraft({ cart, customerId, customerName }, draftIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, customerId, customerName, business?.id, currentLocation?.id, user?.id]);

  // VAT rates for per-line selection.
  const taxRatesQuery = useQuery({
    queryKey: ["tax_rates", "pos", business?.id],
    queryFn: async () => {
      if (!business) return [] as { id: string; name: string; rate: number; is_default: boolean; is_active: boolean }[];
      const { data, error } = await supabase
        .from("tax_rates")
        .select("id, name, rate, is_default, is_active")
        .eq("business_id", business.id);
      if (error) throw error;
      return (data || []).filter((r: any) => r.is_active) as any;
    },
    enabled: !!business?.id,
  });
  const activeTaxRates = (taxRatesQuery.data || []) as {
    id: string;
    name: string;
    rate: number;
    is_default: boolean;
    is_active: boolean;
  }[];
  const defaultTaxRate = activeTaxRates.find((r) => r.is_default) || null;

  const vatEnabled = (business as { vat_enabled?: boolean } | null)?.vat_enabled ?? true;
  const taxInclusive = (business as { tax_inclusive_pricing?: boolean } | null)?.tax_inclusive_pricing ?? true;
  const orgTaxRate = business?.tax_rate ?? 16;

  /** Resolve the VAT % for a cart line: explicit tax_rate_id → product.tax_rate → default rate → org rate. */
  const resolveLineRate = (i: CartItem): number => {
    if (!vatEnabled) return 0;
    if (i.tax_rate_id) {
      const found = activeTaxRates.find((r) => r.id === i.tax_rate_id);
      if (found) return Number(found.rate);
    }
    if (typeof i.product.tax_rate === "number") return Number(i.product.tax_rate);
    if (defaultTaxRate) return Number(defaultTaxRate.rate);
    return Number(orgTaxRate);
  };

  // Totals — respect inclusive vs exclusive pricing.
  const totals = cart.reduce(
    (acc, i) => {
      const lineGross = i.unit_price * i.quantity - i.discount;
      const r = resolveLineRate(i) / 100;
      if (!vatEnabled || r === 0) {
        acc.subtotal += lineGross;
        acc.total += lineGross;
        return acc;
      }
      if (taxInclusive) {
        const net = lineGross / (1 + r);
        acc.subtotal += net;
        acc.tax += lineGross - net;
        acc.total += lineGross;
      } else {
        acc.subtotal += lineGross;
        acc.tax += lineGross * r;
        acc.total += lineGross * (1 + r);
      }
      return acc;
    },
    { subtotal: 0, tax: 0, total: 0 },
  );
  const cartSubtotal = totals.subtotal;
  const cartTax = totals.tax;
  const cartTotal = totals.total;

  // Group VAT by rate for audit / receipt.
  const vatBreakdown: VatBreakdownRow[] = (() => {
    if (!vatEnabled) return [];
    const map = new Map<number, VatBreakdownRow>();
    for (const i of cart) {
      const pct = resolveLineRate(i);
      if (pct === 0) continue;
      const lineGross = i.unit_price * i.quantity - i.discount;
      const r = pct / 100;
      const net = taxInclusive ? lineGross / (1 + r) : lineGross;
      const vat = taxInclusive ? lineGross - net : lineGross * r;
      const key = Math.round(pct * 100) / 100;
      const existing = map.get(key);
      if (existing) {
        existing.taxable += net;
        existing.vat += vat;
      } else {
        map.set(key, { rate: key, label: `VAT ${key}%`, taxable: net, vat });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
  })();

  // Hold current sale — persist to suspended_sales table so it survives reload & syncs across devices
  const holdSale = useCallback(
    async (customLabel?: string) => {
      if (!business || !currentLocation || !user || cart.length === 0) return;
      const label = (customLabel && customLabel.trim()) || customerName || `Sale ${new Date().toLocaleTimeString()}`;
      const { error } = await supabase.from("suspended_sales").insert({
        business_id: business.id,
        location_id: currentLocation.id,
        label,
        customer_id: customerId,
        customer_name: customerName,
        cart: cart as any,
        created_by: user.id,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["suspended_sales"] });
      clearCart();
      toast.info(`Sale parked: ${label}`);
    },
    [cart, customerId, customerName, business, currentLocation, user, queryClient, clearCart],
  );

  // Resume a held sale
  const resumeSale = useCallback(
    async (id: string) => {
      const held = heldSales.find((h) => h.id === id);
      if (!held) return;
      if (cart.length > 0) await holdSale();
      setCart(held.cart);
      setCustomerId(held.customerId);
      setCustomerName(held.customerName);
      await supabase.from("suspended_sales").delete().eq("id", id);
      queryClient.invalidateQueries({ queryKey: ["suspended_sales"] });
    },
    [heldSales, cart, holdSale, queryClient],
  );

  const removeHeldSale = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("suspended_sales").delete().eq("id", id);
      if (error) toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ["suspended_sales"] });
    },
    [queryClient],
  );

  /**
   * Reserve the sale before an M-Pesa STK prompt goes out.
   *
   * The row is written as status "pending" / payment_status "unpaid" so the
   * accounting triggers do not post anything yet, but the Daraja callback has a
   * real sale_id (and an authoritative total) to settle against.
   */
  const createPendingSale = useCallback(
    async (opts: { loyaltyDiscount?: number; loyaltyNote?: string | null } = {}) => {
      if (!business || !currentLocation || !user || cart.length === 0) return null;
      if (!ensureCanPost()) return null;

      const loyaltyDiscount = Math.max(0, Number(opts.loyaltyDiscount || 0));
      const effectiveTotal = Math.max(0, cartTotal - loyaltyDiscount);
      const existing = pendingSaleRef.current;

      // Reuse the reservation when the customer retries after a failed prompt.
      if (existing && Math.abs(existing.total - effectiveTotal) < 0.01) return existing;
      if (existing) {
        pendingSaleRef.current = null;
        await supabase.from("sales").delete().eq("id", existing.saleId).eq("status", "pending");
      }


      const saleId = crypto.randomUUID();
      const invoiceNumber = consumeNext(business.id, "receipts");

      const { error } = await supabase.from("sales").insert({
        id: saleId,
        idempotency_key: saleId,
        business_id: business.id,
        location_id: currentLocation.id,
        customer_id: customerId,
        invoice_number: invoiceNumber,
        subtotal: cartSubtotal,
        tax: Math.round(cartTax * 100) / 100,
        discount: cart.reduce((s, i) => s + i.discount, 0) + loyaltyDiscount,
        total: effectiveTotal,
        payment_status: "unpaid",
        status: "pending",
        created_by: user.id,
        notes: opts.loyaltyNote || null,
      });
      if (error) {
        toast.error(`Could not start the M-Pesa payment: ${error.message}`);
        return null;
      }

      const reserved = { saleId, invoiceNumber, total: effectiveTotal };
      pendingSaleRef.current = reserved;
      return reserved;
    },
    [business, currentLocation, user, cart, cartTotal, cartSubtotal, cartTax, customerId, ensureCanPost],
  );

  /** Drop an unpaid reservation when the cashier abandons the M-Pesa payment. */
  const cancelPendingSale = useCallback(async () => {
    const pending = pendingSaleRef.current;
    if (!pending) return;
    pendingSaleRef.current = null;
    await supabase.from("sales").delete().eq("id", pending.saleId).eq("status", "pending");
  }, []);


  // Complete sale
  const completeSale = async (
    payments: PaymentEntry[],
    bankAccountId?: string | null,
    pushToEtims: boolean = true,
    opts: { loyaltyDiscount?: number; loyaltyNote?: string | null } = {},
  ) => {
    if (!business || !currentLocation || !user || cart.length === 0) return null;
    if (!ensureCanPost()) return null;
    // Guard against double-submits (rapid clicks / Enter key repeats).
    if (completingRef.current) return null;
    completingRef.current = true;
    setProcessing(true);

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
          completingRef.current = false;
          setProcessing(false);
          return null;
        }
      }
    }

    try {
      const loyaltyDiscount = Math.max(0, Number(opts.loyaltyDiscount || 0));
      const cartDiscountBase = cart.reduce((s, i) => s + i.discount, 0);
      const effectiveDiscount = cartDiscountBase + loyaltyDiscount;
      const effectiveTotal = Math.max(0, cartTotal - loyaltyDiscount);

      const totalTendered = payments.reduce((s, p) => s + Math.max(0, Number(p.amount || 0)), 0);
      const appliedPayments = applyPaymentsToSaleTotal(payments, effectiveTotal);
      const totalPaid = appliedPayments.reduce((s, p) => s + p.amount, 0);
      const paymentStatus = totalPaid >= effectiveTotal ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

      // An M-Pesa sale was already reserved (and possibly already paid by the
      // callback) — finalise that row instead of creating a second one.
      const reserved = pendingSaleRef.current;
      const invoiceNumber = reserved?.invoiceNumber ?? consumeNext(business.id, "receipts");
      const saleId = reserved?.saleId ?? crypto.randomUUID();


      // --- Offline path -----------------------------------------------------
      // No connection: queue the whole sale locally (sale id doubles as the
      // idempotency key) and hand back a receipt so the customer can leave.
      if (!isOnline()) {
        const offlineItems = cart.map((i) => ({
          sale_id: saleId,
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          total: i.unit_price * i.quantity - i.discount,
          batch_id: null,
          tax_rate_id: vatEnabled ? (i.tax_rate_id ?? defaultTaxRate?.id ?? null) : null,
        }));

        await enqueueSale({
          id: saleId,
          createdAt: new Date().toISOString(),
          sale: {
            id: saleId,
            business_id: business.id,
            location_id: currentLocation.id,
            customer_id: customerId,
            invoice_number: invoiceNumber,
            subtotal: cartSubtotal,
            tax: Math.round(cartTax * 100) / 100,
            discount: effectiveDiscount,
            total: effectiveTotal,
            payment_status: paymentStatus,
            status: "final",
            created_by: user.id,
            notes: [opts.loyaltyNote, "Recorded offline"].filter(Boolean).join(" | "),
          },
          items: offlineItems,
          payments: appliedPayments.map((p) => ({
            sale_id: saleId,
            method: p.method,
            amount: p.amount,
            reference: p.reference || null,
          })),
          // Stock movements are derived from the sale document itself — no mirror
          // adjustment rows (they duplicated every stock transaction).
          adjustments: [],
          bankTransaction: bankAccountId
            ? {
                business_id: business.id,
                bank_account_id: bankAccountId,
                type: "payment_received",
                amount: totalPaid,
                date: new Date().toISOString().split("T")[0],
                reference: invoiceNumber,
                description: `Sale ${invoiceNumber} (offline)`,
                category: "Sales",
                contact_name: customerName || null,
                sale_id: saleId,
                created_by: user.id,
              }
            : null,
          inventoryDeltas: cart.map((i) => ({
            product_id: i.product.id,
            location_id: currentLocation.id,
            quantity: i.quantity,
          })),
        });

        const offlineResult = {
          saleId,
          invoiceNumber,
          items: cart,
          subtotal: cartSubtotal,
          tax: Math.round(cartTax * 100) / 100,
          discount: effectiveDiscount,
          total: effectiveTotal,
          payments,
          totalPaid: totalTendered,
          change: Math.max(0, totalTendered - effectiveTotal),
          customerName,
          locationName: currentLocation.name,
          businessName: business.name,
          servedBy: (user as { email?: string } | null)?.email || null,
          date: new Date(),
          fiscal: null,
          vatBreakdown,
          taxInclusive,
          loyaltyDiscount,
          offline: true,
        };
        clearCart();
        window.dispatchEvent(new CustomEvent("pos-offline-sale-queued"));
        toast.success("Sale saved offline — it will sync automatically");
        completingRef.current = false;
        setProcessing(false);

        return offlineResult;
      }

      if (reserved) {
        // The callback may already have settled it; never downgrade a paid sale.
        const { data: current } = await supabase
          .from("sales")
          .select("payment_status")
          .eq("id", saleId)
          .maybeSingle();
        const { error: updErr } = await supabase
          .from("sales")
          .update({
            customer_id: customerId,
            subtotal: cartSubtotal,
            tax: Math.round(cartTax * 100) / 100,
            discount: effectiveDiscount,
            total: effectiveTotal,
            payment_status: current?.payment_status === "paid" ? "paid" : paymentStatus,
            status: "final",
            notes: opts.loyaltyNote || null,
          })
          .eq("id", saleId);
        if (updErr) throw updErr;
      } else {
        const { error: saleErr } = await supabase.from("sales").insert({
          id: saleId,
          // Server-side idempotency: a replayed finalize hits the unique index
          // (business_id, idempotency_key) and is rejected instead of duplicating.
          idempotency_key: saleId,
          business_id: business.id,
          location_id: currentLocation.id,
          customer_id: customerId,
          invoice_number: invoiceNumber,
          subtotal: cartSubtotal,
          tax: Math.round(cartTax * 100) / 100,
          discount: effectiveDiscount,
          total: effectiveTotal,
          payment_status: paymentStatus,
          status: "final",
          created_by: user.id,
          notes: opts.loyaltyNote || null,
        });
        if (saleErr) {
          // 23505 = the same finalize was already committed (duplicate click / retry).
          if ((saleErr as { code?: string }).code === "23505") {
            toast.info("This sale was already recorded");
            clearCart();
            return null;
          }
          throw saleErr;
        }
      }


      const isPharmacy = (business as any)?.business_type === "pharmacy";
      const saleItems: any[] = [];
      const batchDeductions: { batch_id: string; quantity: number }[] = [];

      for (const i of cart) {
        let batchId: string | null = null;
        if (isPharmacy) {
          const picks = await pickFefoBatches(i.product.id, currentLocation.id, i.quantity);
          if (picks.length > 0) batchId = picks[0].batch_id;
          batchDeductions.push(...picks);
        }
        // Resolve which tax_rate_id to persist. Fall back to the business default.
        const resolvedTaxRateId = i.tax_rate_id ?? defaultTaxRate?.id ?? null;
        saleItems.push({
          sale_id: saleId,
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          total: i.unit_price * i.quantity - i.discount,
          batch_id: batchId,
          tax_rate_id: vatEnabled ? resolvedTaxRateId : null,
        });
      }
      const { error: itemsErr } = await supabase.from("sale_items").insert(saleItems);
      if (itemsErr) throw itemsErr;

      if (batchDeductions.length > 0) {
        await Promise.all(
          batchDeductions.map((p) =>
            supabase.rpc("decrement_batch_quantity" as any, { _batch_id: p.batch_id, _qty: p.quantity }),
          ),
        );
      }

      if (payments.length > 0) {
        let paymentRows = appliedPayments.map((p) => ({
          sale_id: saleId,
          method: p.method,
          amount: p.amount,
          reference: p.reference || null,
        }));

        if (reserved) {
          // The M-Pesa callback already wrote its own payment row — don't double it.
          const { data: existingPayments } = await supabase
            .from("payments")
            .select("method, reference, amount")
            .eq("sale_id", saleId);
          const seen = new Set(
            (existingPayments || []).map((p) => `${p.method}|${p.reference ?? ""}|${Number(p.amount).toFixed(2)}`),
          );
          paymentRows = paymentRows.filter(
            (p) => !seen.has(`${p.method}|${p.reference ?? ""}|${Number(p.amount).toFixed(2)}`),
          );
        }

        if (paymentRows.length > 0) {
          const { error: payErr } = await supabase.from("payments").insert(paymentRows);
          if (payErr) throw payErr;
        }

      }

      const inventoryUpdates = await Promise.all(
        cart.map(async (item) => {
          const { data: inv } = await supabase
            .from("inventory")
            .select("id, quantity")
            .eq("product_id", item.product.id)
            .eq("location_id", currentLocation.id)
            .maybeSingle();
          return { item, inv };
        }),
      );

      await Promise.all(
        inventoryUpdates
          .filter(({ inv }) => inv)
          .map(({ item, inv }) =>
            supabase
              .from("inventory")
              .update({ quantity: inv!.quantity - item.quantity })
              .eq("id", inv!.id),
          ),
      );

      // No mirror stock_adjustments row: the sale document is the stock movement.
      // The Inventory Movement ledger reads sales/purchases directly.

      if (bankAccountId) {
        const { error: btErr } = await supabase.from("bank_transactions").insert({
          business_id: business.id,
          bank_account_id: bankAccountId,
          type: "payment_received",
          amount: totalPaid,
          date: new Date().toISOString().split("T")[0],
          reference: invoiceNumber,
          description: `Sale ${invoiceNumber}`,
          category: "Sales",
          contact_name: customerName || null,
          sale_id: saleId,
          created_by: user.id,
        });
        if (btErr) console.error("Bank txn error:", btErr);
        // Account balance is maintained by the database (recomputed from transactions).
      }

      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock_adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });

      // KRA eTIMS fiscal submission — synchronous when user opted in via "Push to eTIMS".
      let fiscal: Record<string, unknown> | null = null;
      let fiscalError: string | null = null;
      if (pushToEtims) {
        try {
          const { submitSaleToDigitax } = await import("@/hooks/useDigitax");
          const res = await submitSaleToDigitax(saleId, { wait: true });
          fiscal = (res?.sale as Record<string, unknown>) ?? null;
          const ref = fiscal?.fiscal_reference as string | undefined;
          const status = fiscal?.fiscal_status as string | undefined;
          if (ref) {
            toast.success(`Fiscalised with KRA — Ref ${ref}`);
          } else if (status === "accepted" || status === "submitted") {
            toast.success("Sale submitted to KRA eTIMS");
          } else {
            toast.info("Queued for KRA eTIMS submission");
          }
        } catch (e: unknown) {
          // Try to extract server validation details from FunctionsHttpError
          let msg = (e as Error)?.message || "Failed to push to eTIMS";
          try {
            const ctx = (e as { context?: Response }).context;
            if (ctx && typeof (ctx as Response).json === "function") {
              const body = await (ctx as Response).clone().json();
              if (body?.error) msg = body.error;
            }
          } catch {
            /* ignore */
          }
          fiscalError = msg;
          fiscal = { fiscal_status: "failed", fiscal_error: msg } as Record<string, unknown>;
          toast.error(`eTIMS push failed: ${msg}`, { duration: 8000 });
        }
      }

      const result = {
        saleId,
        invoiceNumber,
        items: cart,
        subtotal: cartSubtotal,
        tax: Math.round(cartTax * 100) / 100,
        discount: effectiveDiscount,
        total: effectiveTotal,
        payments,
        totalPaid: totalTendered,
        change: Math.max(0, totalTendered - effectiveTotal),
        customerName,
        locationName: currentLocation.name,
        businessName: business.name,
        servedBy: (user as { email?: string } | null)?.email || null,
        date: new Date(),
        fiscal,
        vatBreakdown,
        taxInclusive,
        loyaltyDiscount,
      };

      clearCart();
      toast.success("Sale completed!");
      return result;
    } catch (err: any) {
      toast.error(err.message);
      return null;
    } finally {
      completingRef.current = false;
      setProcessing(false);
    }
  };

  return {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    customerId,
    setCustomerId,
    customerName,
    setCustomerName,
    cartSubtotal,
    cartTax,
    cartTotal,
    vatBreakdown,
    taxInclusive,
    vatEnabled,
    activeTaxRates,
    defaultTaxRate,
    heldSales,
    holdSale,
    resumeSale,
    removeHeldSale,
    completeSale,
    processing,
    stockOf,
    preventOverselling,
  };
}
