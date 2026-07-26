import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Pause, Play, X,
  User, List, LayoutGrid, Sunrise, Banknote, Smartphone, CreditCard, ScanLine,
  ChevronUp, ChevronDown, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { useProducts, useCategories } from "@/hooks/useProducts";
import { useCustomers } from "@/hooks/useSales";
import { usePOS, PaymentEntry } from "@/hooks/usePOS";
import { usePOSSession } from "@/hooks/usePOSSession";
import { useInventory } from "@/hooks/useInventory";
import { useBusiness } from "@/contexts/BusinessContext";
import { useIsMobile } from "@/hooks/use-mobile";
import PaymentDialog, { LoyaltyPayload } from "@/components/pos/PaymentDialog";
import ReceiptDialog from "@/components/pos/ReceiptDialog";
import StartDayDialog from "@/components/pos/StartDayDialog";
import ManagerApprovalDialog from "@/components/pos/ManagerApprovalDialog";
import BarcodeScanner from "@/components/BarcodeScanner";
import { CartItemRow } from "@/components/pos/CartItemRow";
import { logAudit } from "@/lib/audit";
import { CartItem } from "@/hooks/usePOS";
import { supabase } from "@/integrations/supabase/client";
import { useBarcodeScanner, useScanSettings } from "@/hooks/useBarcodeScanner";
import { ScannerSettingsDialog } from "@/components/pos/ScannerSettingsDialog";
import { parseBarcode } from "@/lib/barcodeScan";



const POS = () => {
  const { productsQuery } = useProducts();
  const { query: categoriesQuery } = useCategories();
  const { query: customersQuery } = useCustomers({ pageSize: 1000 });
  const pos = usePOS();
  const session = usePOSSession();
  const { currentLocation, locations, setCurrentLocation, business, userRole } = useBusiness();
  const { inventoryQuery } = useInventory(currentLocation?.id);

  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<"cash" | "mpesa" | "card">("cash");
  const [receiptData, setReceiptData] = useState<any>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [startDayOpen, setStartDayOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanSettingsOpen, setScanSettingsOpen] = useState(false);
  const scanSettings = useScanSettings();

  const [mobileCartExpanded, setMobileCartExpanded] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const pendingRemoveResolver = useRef<((approved: boolean) => void) | null>(null);
  const pendingRemoveItem = useRef<CartItem | null>(null);

  // Per-location override (true/false) takes precedence over business default.
  const businessRequires = (business as any)?.pos_require_manager_to_remove_item ?? false;
  const locationOverride = (currentLocation as any)?.pos_require_manager_to_remove_item;
  const requireManagerToRemove =
    locationOverride === null || locationOverride === undefined ? businessRequires : !!locationOverride;
  // Admins/managers/stores managers don't need extra approval — they ARE the approvers.
  const cashierNeedsApproval = requireManagerToRemove && userRole === "cashier";
  const showStockQty = (business as { pos_show_stock_qty?: boolean })?.pos_show_stock_qty ?? true;
  const hideZeroStock = (business as { pos_hide_zero_stock?: boolean })?.pos_hide_zero_stock ?? true;

  const handleBeforeRemove = useCallback((item: CartItem): Promise<boolean> => {
    if (!cashierNeedsApproval) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      pendingRemoveResolver.current = resolve;
      pendingRemoveItem.current = item;
      setApprovalOpen(true);
    });
  }, [cashierNeedsApproval]);

  const handleApproved = useCallback((managerUserId: string) => {
    const item = pendingRemoveItem.current;
    // Resolve immediately so the cart updates without waiting for audit logging.
    pendingRemoveResolver.current?.(true);
    pendingRemoveResolver.current = null;
    pendingRemoveItem.current = null;
    // Fire-and-forget audit log.
    if (business && item) {
      void logAudit({
        business_id: business.id,
        action: "pos_item_removed",
        entity_type: "product",
        entity_id: item.product.id,
        description: `Removed "${item.product.name}" (qty ${item.quantity}) from POS cart with manager approval`,
        metadata: { approved_by: managerUserId, qty: item.quantity },
      });
    }
  }, [business]);

  const handleApprovalClosed = useCallback((open: boolean) => {
    setApprovalOpen(open);
    if (!open && pendingRemoveResolver.current) {
      pendingRemoveResolver.current(false);
      pendingRemoveResolver.current = null;
      pendingRemoveItem.current = null;
    }
  }, []);

  const handleScanned = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const parsed = parseBarcode(trimmed, scanSettings.parseGs1);
    const list = (productsQuery.data ?? []).filter((p) => p.is_active);
    let match: (typeof list)[number] | undefined;
    for (const candidate of parsed.candidates) {
      match = list.find((p) => p.barcode === candidate || p.sku === candidate);
      if (match) break;
    }
    if (match) {
      if (scanSettings.autoAddToCart) {
        pos.addToCart(match);
        setSearch("");
      } else {
        setSearch(match.name);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      return;
    }
    // Not found: cart stays unchanged; optionally surface the code for manual lookup.
    toast.warning(`No product matches "${trimmed}"`);
    if (scanSettings.openSearchOnMiss) {
      setSearch(trimmed);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    } else {
      setSearch("");
    }
  };



  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const customers = customersQuery.data?.rows ?? [];
  const inventory = inventoryQuery.data ?? [];

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    inventory.forEach((i) => m.set(i.product_id, Number(i.quantity)));
    return m;
  }, [inventory]);

  const activeProducts = useMemo(
    () =>
      products.filter((p) => {
        if (!p.is_active) return false;
        // Optionally hide zero / negative stock products (business setting).
        if (hideZeroStock) {
          const qty = stockMap.get(p.id) ?? 0;
          if (qty <= 0) return false;
        }
        const matchSearch =
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode || "").includes(search);
        const matchCat = categoryFilter === "all" || p.category_id === categoryFilter;
        return matchSearch && matchCat;
      }),
    [products, search, categoryFilter, stockMap, hideZeroStock]
  );

  const handlePaymentConfirm = async (payments: PaymentEntry[], bankAccountId: string | null, pushToEtims: boolean, loyalty: LoyaltyPayload | null) => {
    let loyaltyCtx: {
      customerId: string;
      pointsBalance: number;
      pointsRedeemed: number;
      pointsEarned: number;
      redemptionValue: number;
    } | null = null;

    if (loyalty && business) {
      try {
        let customerId = loyalty.existingCustomerId;
        let currentPoints = loyalty.pointsBalance;
        if (!customerId) {
          if (!loyalty.name.trim()) {
            toast.error("Customer name is required for a new phone number");
            return;
          }
          const { data: created, error } = await supabase
            .from("customers")
            .insert({ business_id: business.id, name: loyalty.name.trim(), phone: loyalty.phone, balance: 0 })
            .select("id, loyalty_points")
            .single();
          if (error) throw error;
          customerId = created.id;
          currentPoints = Number(created.loyalty_points || 0);
        }
        pos.setCustomerId(customerId);
        pos.setCustomerName(loyalty.name || `Customer ${loyalty.phone.slice(-4)}`);

        const minPurchase = Number((business as { loyalty_min_purchase_amount?: number } | null)?.loyalty_min_purchase_amount ?? 0);
        const pointsPerKes = Number((business as { loyalty_points_per_kes?: number } | null)?.loyalty_points_per_kes ?? 1);
        const adjustedTotal = Math.max(0, pos.cartTotal - loyalty.redemptionValue);
        const earned = adjustedTotal >= minPurchase ? Math.floor((adjustedTotal / 10) * pointsPerKes) : 0;

        loyaltyCtx = {
          customerId,
          pointsBalance: currentPoints,
          pointsRedeemed: loyalty.redeemPoints,
          pointsEarned: earned,
          redemptionValue: loyalty.redemptionValue,
        };
      } catch (e: any) {
        toast.warning(`Loyalty capture skipped: ${e.message || "unknown error"}`);
      }
    }

    const result = await pos.completeSale(payments, bankAccountId, pushToEtims, {
      loyaltyDiscount: loyaltyCtx?.redemptionValue ?? 0,
      loyaltyNote: loyaltyCtx ? `Redeemed ${loyaltyCtx.pointsRedeemed} pts` : null,
    });

    if (result && loyaltyCtx) {
      const newBalance = loyaltyCtx.pointsBalance - loyaltyCtx.pointsRedeemed + loyaltyCtx.pointsEarned;
      try {
        await supabase
          .from("customers")
          .update({
            loyalty_points: newBalance,
            loyalty_last_earned_at: loyaltyCtx.pointsEarned > 0 ? new Date().toISOString() : undefined,
          })
          .eq("id", loyaltyCtx.customerId);
        if (loyaltyCtx.pointsEarned > 0) toast.success(`+${loyaltyCtx.pointsEarned} loyalty points awarded`);
        if (loyaltyCtx.pointsRedeemed > 0) toast.success(`Redeemed ${loyaltyCtx.pointsRedeemed} points (KES ${loyaltyCtx.redemptionValue.toLocaleString()})`);
      } catch (e: any) {
        toast.warning(`Loyalty balance update failed: ${e.message}`);
      }
      (result as any).loyalty = {
        pointsBalance: newBalance,
        pointsEarned: loyaltyCtx.pointsEarned,
        pointsRedeemed: loyaltyCtx.pointsRedeemed,
        redemptionValue: loyaltyCtx.redemptionValue,
      };
    }

    if (result) {
      setPaymentOpen(false);
      setReceiptData(result);
      setReceiptOpen(true);
      // Auto-open cash drawer if configured
      try {
        const { loadCashDrawerConfig, openCashDrawer } = await import("@/lib/cashDrawer");
        const cfg = loadCashDrawerConfig();
        if (cfg.autoOpen && cfg.mode !== "off") void openCashDrawer(cfg);
      } catch { /* noop */ }
    }
  };

  const handleStartDay = async (openingFloat: number, locationId: string, cashAccountId: string) => {
    if (locationId && locationId !== currentLocation?.id) {
      const picked = locations.find((l) => l.id === locationId);
      if (picked) setCurrentLocation(picked);
    }
    await session.startDay(openingFloat, locationId, cashAccountId);
    setStartDayOpen(false);
  };

  // Keyboard shortcuts:
  //   F1  scan barcode          F2  focus search
  //   F3  Cash sale (quick complete, exact amount)
  //   F4  open payment dialog on Cash
  //   F5  open payment dialog on M-Pesa (STK Push flow)
  //   F6  open payment dialog on M-Pesa (manual confirmation code)
  //   F7  open payment dialog on Card
  //   F9  park sale             ESC clear cart
  useEffect(() => {
    const openPayment = (method: "cash" | "mpesa" | "card") => {
      if (pos.cart.length === 0) return;
      setInitialPaymentMethod(method);
      setPaymentOpen(true);
    };

    const quickCashComplete = async () => {
      if (pos.cart.length === 0 || pos.processing) return;
      const digitaxOn = (business as any)?.digitax_enabled === true;
      await pos.completeSale(
        [{ method: "cash", amount: pos.cartTotal, reference: "" }],
        null,
        digitaxOn,
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const typing = !!target && (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      );

      switch (e.key) {
        case "F1":
          e.preventDefault();
          setScannerOpen(true);
          break;
        case "F2":
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          break;
        case "F3":
          if (pos.cart.length === 0) return;
          e.preventDefault();
          void quickCashComplete();
          break;
        case "F4":
          e.preventDefault();
          openPayment("cash");
          break;
        case "F5":
        case "F6":
          e.preventDefault();
          openPayment("mpesa");
          break;
        case "F7":
          e.preventDefault();
          openPayment("card");
          break;
        case "F9":
          if (pos.cart.length === 0) return;
          e.preventDefault();
          {
            const suggested = pos.customerName || `Sale ${new Date().toLocaleTimeString()}`;
            const label = window.prompt("Name this parked sale:", suggested);
            if (label !== null) void pos.holdSale(label);
          }
          break;
        case "Escape":
          if (typing) return;
          if (paymentOpen || scannerOpen || approvalOpen || receiptOpen || startDayOpen) return;
          if (pos.cart.length === 0) return;
          e.preventDefault();
          if (window.confirm("Clear the current cart?")) pos.clearCart();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos, business, paymentOpen, scannerOpen, approvalOpen, receiptOpen, startDayOpen]);

  // Global keyboard-wedge scanner listener — works even when nothing is focused.
  useBarcodeScanner({
    onScan: handleScanned,
    disabled: scannerOpen || scanSettingsOpen,
    searchInputRef,
    settings: scanSettings,
  });








  // Show loading while checking session
  if (session.loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-6rem)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // No active session — show Start of Day prompt
  if (!session.activeSession) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-6rem)]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Sunrise className="h-8 w-8 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Start Your Day</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Open the register to begin processing sales. You'll need to count and enter your starting cash float.
              </p>
            </div>
            <Button size="lg" onClick={() => setStartDayOpen(true)}>
              <Sunrise className="mr-2 h-5 w-5" />
              Start of Day
            </Button>
          </CardContent>
        </Card>

        <StartDayDialog open={startDayOpen} onOpenChange={setStartDayOpen} onConfirm={handleStartDay} />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100dvh-6rem)] lg:h-[calc(100vh-6rem)] pb-[env(safe-area-inset-bottom)]">

      {/* Left: Product selection — 3/5 width on large screens */}
      <div className="flex flex-col min-h-0 flex-1 lg:flex-none w-full lg:w-3/5">
        {/* Search & filters - single row on mobile */}
        <div className="flex flex-row gap-2 mb-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search or scan... (F2)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  e.preventDefault();
                  handleScanned(search.trim());
                }
              }}
              className="pl-9"
              autoFocus
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-24 sm:w-40 shrink-0">
              <SelectValue placeholder="Cat." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="shrink-0" onClick={() => setScannerOpen(true)} title="Scan barcode">
            <ScanLine className="h-4 w-4" />
          </Button>
          <Button
            size="icon" variant="outline" className="shrink-0 hidden sm:inline-flex"
            onClick={() => setScanSettingsOpen(true)} title="Scanner settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>

          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant={viewMode === "grid" ? "default" : "outline"} onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={viewMode === "list" ? "default" : "outline"} onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Product grid/list */}
        <ScrollArea className="flex-1">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {activeProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pos.addToCart(p)}
                  className="flex flex-col items-start p-3 rounded-lg border bg-card text-left transition-colors hover:bg-accent hover:border-primary"
                >
                  <span className="font-medium text-sm line-clamp-2">{p.name}</span>
                  {p.sku && <span className="text-xs text-muted-foreground">{p.sku}</span>}
                  <span className="mt-auto pt-1 font-semibold text-primary">KES {Number(p.selling_price).toLocaleString()}</span>
                </button>
              ))}
              {activeProducts.length === 0 && (
                <p className="col-span-full text-center py-10 text-muted-foreground">No products found</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Product</th>
                    {showStockQty && <th className="px-3 py-2 font-medium hidden sm:table-cell">Stock</th>}
                    <th className="px-3 py-2 font-medium text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="theme-alt-rows">
                  {activeProducts.map((p) => {
                    const qty = stockMap.get(p.id) ?? 0;
                    const lowStock = qty <= 0;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => pos.addToCart(p)}
                        className="cursor-pointer border-b last:border-0 hover:bg-accent/60 transition-colors"
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{p.name}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {p.sku && <span className="truncate">{p.sku}</span>}
                              {showStockQty && (
                                <Badge variant={lowStock ? "destructive" : "secondary"} className="sm:hidden text-[10px] font-normal">
                                  Qty: {qty}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        {showStockQty && (
                          <td className="px-3 py-2.5 align-middle hidden sm:table-cell">
                            <Badge variant={lowStock ? "destructive" : "secondary"} className="text-[10px] font-normal">
                              {qty}
                            </Badge>
                          </td>
                        )}
                        <td className="px-3 py-2.5 align-middle text-right font-semibold text-primary whitespace-nowrap">
                          KES {Number(p.selling_price).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  {activeProducts.length === 0 && (
                    <tr>
                      <td colSpan={showStockQty ? 3 : 2} className="text-center py-10 text-muted-foreground">No products found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </ScrollArea>

        {/* Held sales bar */}
        {pos.heldSales.length > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t overflow-x-auto">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Held:</span>
            {pos.heldSales.map((h) => (
              <Badge key={h.id} variant="secondary" className="cursor-pointer flex items-center gap-1 whitespace-nowrap">
                <button onClick={() => pos.resumeSale(h.id)} className="flex items-center gap-1">
                  <Play className="h-3 w-3" /> {h.label}
                </button>
                <button onClick={() => pos.removeHeldSale(h.id)}>
                  <X className="h-3 w-3 hover:text-destructive" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Right: Cart — 2/5 width on large screens */}
      <Card className="w-full lg:w-2/5 lg:flex-none flex flex-col min-h-0 min-w-0 shrink-0">
        {(!isMobile || mobileCartExpanded) && (
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Cart
                {pos.cart.length > 0 && <Badge variant="secondary">{pos.cart.length}</Badge>}
              </CardTitle>
              {isMobile && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMobileCartExpanded(false)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              )}
            </div>
            {/* Customer selector */}
            <Select
              value={pos.customerId || "walkin"}
              onValueChange={(v) => {
                if (v === "walkin") {
                  pos.setCustomerId(null);
                  pos.setCustomerName(null);
                } else {
                  const cust = customers.find((c) => c.id === v);
                  pos.setCustomerId(v);
                  pos.setCustomerName(cust?.name || null);
                }
              }}
            >
              <SelectTrigger className="mt-1">
                <User className="h-4 w-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Walk-in Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walkin">Walk-in Customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
        )}

        <CardContent className="flex-1 flex flex-col min-h-0 p-3">
          {(!isMobile || mobileCartExpanded) && (
            <ScrollArea className="flex-1">
              {pos.cart.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground text-sm">Add products to start a sale</p>
              ) : (
                <div className="space-y-2">
                  {pos.cart.map((item) => (
                    <CartItemRow
                      key={item.product.id}
                      item={item}
                      onUpdate={pos.updateCartItem}
                      onRemove={pos.removeFromCart}
                      onBeforeRemove={handleBeforeRemove}
                      taxRates={pos.vatEnabled ? pos.activeTaxRates : undefined}
                      defaultRateLabel={
                        pos.defaultTaxRate
                          ? `Default (${Number(pos.defaultTaxRate.rate)}%)`
                          : "Default"
                      }
                    />
                  ))}

                </div>
              )}
            </ScrollArea>
          )}

          <div className={`${(!isMobile || mobileCartExpanded) ? "pt-3 border-t mt-2" : ""} space-y-2`}>
            {isMobile && !mobileCartExpanded && pos.cart.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileCartExpanded(true)}
                className="flex items-center justify-between w-full px-2 py-1 rounded hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ShoppingCart className="h-4 w-4" />
                  {pos.cart.length} item{pos.cart.length === 1 ? "" : "s"}
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                </span>
                <span className="font-bold text-base">KES {pos.cartTotal.toLocaleString()}</span>
              </button>
            )}
            {(!isMobile || mobileCartExpanded) && pos.cart.length > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-2xl"><span className="text-muted-foreground">Subtotal</span><span>KES {pos.cartSubtotal.toLocaleString()}</span></div>
                {pos.cartTax > 0 && (
                  <div className="flex justify-between text-2xl"><span className="text-muted-foreground">VAT ({pos.taxInclusive ? "incl." : "excl."})</span><span>KES {Math.round(pos.cartTax).toLocaleString()}</span></div>
                )}

                <Separator />
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="text-5xl">KES {pos.cartTotal.toLocaleString()}</span></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="default"
                className="flex flex-col items-center gap-0.5 h-auto py-3 bg-[hsl(5,75%,48%)] hover:bg-[hsl(5,75%,42%)] text-white border-transparent text-lg font-semibold"
                disabled={pos.cart.length === 0}
                onClick={() => { setInitialPaymentMethod("cash"); setPaymentOpen(true); }}
              >
                <Banknote className="h-5 w-5" />
                <span className="text-xs font-medium">Cash</span>
              </Button>
              <Button
                variant="outline"
                className="flex flex-col items-center gap-0.5 h-auto py-3 bg-[hsl(130,55%,25%)] text-white border-[hsl(130,55%,25%)] hover:bg-[hsl(130,55%,20%)] text-lg font-semibold"
                disabled={pos.cart.length === 0}
                onClick={() => { setInitialPaymentMethod("mpesa"); setPaymentOpen(true); }}
              >
                <Smartphone className="h-5 w-5" />
                <span className="text-xs font-medium">M-Pesa</span>
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="outline"
                className="flex flex-col items-center gap-0.5 h-auto py-2 bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
                disabled={pos.cart.length === 0}
                onClick={() => {
                  if (!pos.customerId) {
                    toast.error("Credit Sale requires a customer. Select a customer above (walk-in is not allowed).");
                    return;
                  }
                  setInitialPaymentMethod("card");
                  setPaymentOpen(true);
                }}
              >
                <CreditCard className="h-4 w-4" />
                <span className="text-[10px] font-medium">Credit Sale</span>
              </Button>
              <Button
                variant="outline"
                className="flex flex-col items-center gap-0.5 h-auto py-2 bg-yellow-500 text-white border-yellow-500 hover:bg-yellow-600"
                disabled={pos.cart.length === 0}
                onClick={() => {
                  const suggested = pos.customerName || `Sale ${new Date().toLocaleTimeString()}`;
                  const label = window.prompt("Name this parked sale:", suggested);
                  if (label === null) return; // cancelled
                  void pos.holdSale(label);
                }}
                title="Park sale (F9)"
              >
                <Pause className="h-4 w-4" />
                <span className="text-[10px] font-medium">Suspend Sale</span>
              </Button>
              <Button
                variant="outline"
                className="flex flex-col items-center gap-0.5 h-auto py-2 border-destructive text-destructive hover:bg-destructive/10"
                disabled={pos.cart.length === 0}
                onClick={pos.clearCart}
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-[10px] font-medium">Clear</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        total={pos.cartTotal}
        onConfirm={handlePaymentConfirm}
        processing={pos.processing}
        initialMethod={initialPaymentMethod}
      />

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        data={receiptData}
      />

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={handleScanned} />

      <ScannerSettingsDialog open={scanSettingsOpen} onOpenChange={setScanSettingsOpen} />


      <ManagerApprovalDialog
        open={approvalOpen}
        onOpenChange={handleApprovalClosed}
        onApproved={handleApproved}
        title="Approve item removal"
        description="A manager must approve removing this item already added to the cart."
      />

    </div>
  );
};

export default POS;
