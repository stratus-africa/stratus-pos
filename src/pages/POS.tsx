import { format } from "date-fns";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShoppingCart, Search, Plus, Trash2, Pause, Play, X,
  User, Sunrise, Banknote, Smartphone, ScanLine,
  Settings2, Printer, Loader2,

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
import { CartTable } from "@/components/pos/CartTable";
import { logAudit } from "@/lib/audit";
import { CartItem } from "@/hooks/usePOS";
import { supabase } from "@/integrations/supabase/client";
import { useBarcodeScanner, useScanSettings } from "@/hooks/useBarcodeScanner";
import { ScannerSettingsDialog } from "@/components/pos/ScannerSettingsDialog";
import { parseBarcode } from "@/lib/barcodeScan";
import {
  displayLineItem, displayPaid, displayThankYou, displayTotal, displayWelcome,
  loadCustomerDisplayConfig,
} from "@/lib/customerDisplay";
import { loadLastReceipt } from "@/lib/lastReceipt";
import CreditCustomerDialog from "@/components/pos/CreditCustomerDialog";
import { useAuth } from "@/contexts/AuthContext";
import { clampSplit, loadLocalSplit, saveLocalSplit, SPLIT_FALLBACK } from "@/lib/posLayout";
import { useOfflineSales } from "@/hooks/useOfflineSales";




const POS = () => {
  const { productsQuery } = useProducts();
  const { query: categoriesQuery } = useCategories();
  const { query: customersQuery } = useCustomers({ pageSize: 1000 });
  const pos = usePOS();
  const session = usePOSSession();
  const { currentLocation, locations, setCurrentLocation, business, userRole } = useBusiness();
  const { inventoryQuery } = useInventory(currentLocation?.id);

  const isMobile = useIsMobile();
  const { user: authUser } = useAuth();
  const offline = useOfflineSales();
  /** Mobile only: tap to switch between the product list and a full-screen cart. */
  const [mobilePane, setMobilePane] = useState<"cart" | "summary">("cart");

  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Focus the picker search input whenever the modal opens.
  useEffect(() => {
    if (productPickerOpen) {
      const id = requestAnimationFrame(() => pickerSearchRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [productPickerOpen]);



  const [paymentOpen, setPaymentOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<"cash" | "mpesa" | "card">("cash");
  const [receiptData, setReceiptData] = useState<any>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [reprintData, setReprintData] = useState<any>(null);
  const [reprintOpen, setReprintOpen] = useState(false);

  const [startDayOpen, setStartDayOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanSettingsOpen, setScanSettingsOpen] = useState(false);
  const scanSettings = useScanSettings();

  // Inline product table on the POS screen (toggled next to scanner settings).
  const [showProductList, setShowProductList] = useState(false);
  useEffect(() => {
    try {
      setShowProductList(localStorage.getItem("pos-show-product-list") === "1");
    } catch { /* storage unavailable */ }
  }, []);
  const toggleProductList = () => {
    setShowProductList((prev) => {
      const next = !prev;
      try { localStorage.setItem("pos-show-product-list", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };



  // --- Resizable split between product list and cart (desktop only) ----------
  // Width preference resolves as: this user's saved width on this device →
  // the tenant-wide default (businesses.pos_split_pct) → 60%.
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [isWide, setIsWide] = useState(false);
  const [splitPct, setSplitPct] = useState(SPLIT_FALLBACK);
  const [dragging, setDragging] = useState(false);
  const tenantSplit = (business as { pos_split_pct?: number | null } | null)?.pos_split_pct ?? null;
  const canSetTenantDefault = userRole === "admin" || userRole === "manager";

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const local = loadLocalSplit(business?.id, authUser?.id);
    setSplitPct(clampSplit(local ?? tenantSplit ?? SPLIT_FALLBACK));
  }, [business?.id, authUser?.id, tenantSplit]);

  useEffect(() => {
    if (!dragging) return;
    const move = (clientX: number) => {
      const el = splitRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      setSplitPct(clampSplit(pct));
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX);
    const onTouchMove = (e: TouchEvent) => e.touches[0] && move(e.touches[0].clientX);
    const stop = () => setDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  }, [dragging]);

  useEffect(() => {
    if (isWide) saveLocalSplit(splitPct, business?.id, authUser?.id);
  }, [splitPct, isWide, business?.id, authUser?.id]);

  const saveTenantSplit = useCallback(async () => {
    if (!business?.id || !canSetTenantDefault) return;
    const { error } = await supabase
      .from("businesses")
      .update({ pos_split_pct: clampSplit(splitPct) })
      .eq("id", business.id);
    if (error) toast.error("Could not save the layout for the business");
    else toast.success("Layout saved as the default for all tills");
  }, [business?.id, canSetTenantDefault, splitPct]);

  const isResume = pos.cart.length === 0 && pos.heldSales.length > 0;
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [creditCustomerOpen, setCreditCustomerOpen] = useState(false);
  const pendingRemoveResolver = useRef<((approved: boolean) => void) | null>(null);
  const pendingRemoveItem = useRef<CartItem | null>(null);

  // --- Customer display pole -------------------------------------------------
  // Mirrors the cart on a customer-facing VFD/LCD pole (configured in Settings).
  const displayCfg = useMemo(() => loadCustomerDisplayConfig(), []);
  const lastCartKey = useRef<string>("");
  useEffect(() => {
    if (displayCfg.mode === "off") return;
    const cart = pos.cart;
    const key = cart.map((i) => `${i.product.id}:${i.quantity}`).join("|");
    if (key === lastCartKey.current) return;
    lastCartKey.current = key;
    if (cart.length === 0) {
      void displayWelcome(displayCfg);
      return;
    }
    const last = cart[cart.length - 1];
    void displayLineItem(
      last.product.name,
      (last.unit_price * last.quantity) - (last.discount || 0),
      pos.cartTotal,
      displayCfg,
    );
  }, [pos.cart, pos.cartTotal, displayCfg]);

  // Show the amount due while the payment dialog is open.
  useEffect(() => {
    if (displayCfg.mode === "off" || !paymentOpen) return;
    void displayTotal(pos.cartTotal, displayCfg);
  }, [paymentOpen, pos.cartTotal, displayCfg]);



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
        setPickerSearch("");
      } else {
        setProductPickerOpen(true);
        setPickerSearch(match.name);
        requestAnimationFrame(() => pickerSearchRef.current?.focus());
      }
      return;
    }
    // Not found: cart stays unchanged; optionally surface the code for manual lookup.
    toast.warning(`No product matches "${trimmed}"`);
    if (scanSettings.openSearchOnMiss) {
      setProductPickerOpen(true);
      setPickerSearch(trimmed);
      requestAnimationFrame(() => {
        pickerSearchRef.current?.focus();
        pickerSearchRef.current?.select();
      });
    } else {
      setPickerSearch("");
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

  // Debounce the picker search so typing stays fluid on large catalogues.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(pickerSearch), 150);
    return () => clearTimeout(t);
  }, [pickerSearch]);

  const matchedProducts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.is_active) return false;
      // Optionally hide zero / negative stock products (business setting).
      if (hideZeroStock) {
        const qty = stockMap.get(p.id) ?? 0;
        if (qty <= 0) return false;
      }
      const matchSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.sku || "").toLowerCase().includes(term) ||
        (p.barcode || "").toLowerCase().includes(term);
      const matchCat = categoryFilter === "all" || p.category_id === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [products, debouncedSearch, categoryFilter, stockMap, hideZeroStock]);

  /** Capped list actually rendered — keeps the picker fast on big catalogues. */
  const MAX_PICKER_ROWS = 200;
  const activeProducts = useMemo(
    () => matchedProducts.slice(0, MAX_PICKER_ROWS),
    [matchedProducts],
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
      // Customer display: show paid / change, then the thank-you message.
      if (displayCfg.mode !== "off") {
        const tendered = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
        const saleTotal = Number((result as any)?.total ?? tendered);
        void displayPaid(saleTotal, tendered, Math.max(0, tendered - saleTotal), displayCfg);
        window.setTimeout(() => { void displayThankYou(displayCfg); }, 4000);
        lastCartKey.current = "";
      }
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
  //   F1  scan barcode          F2  open product picker
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
          setProductPickerOpen(true);
          requestAnimationFrame(() => pickerSearchRef.current?.focus());
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
          if (paymentOpen || scannerOpen || approvalOpen || receiptOpen || startDayOpen || productPickerOpen) return;
          if (pos.cart.length === 0) return;
          e.preventDefault();
          if (window.confirm("Clear the current cart?")) pos.clearCart();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos, business, paymentOpen, scannerOpen, approvalOpen, receiptOpen, startDayOpen, productPickerOpen]);


  // Global keyboard-wedge scanner listener — works anywhere on the POS screen,
  // with or without the product picker open and with nothing focused.
  useBarcodeScanner({
    onScan: handleScanned,
    disabled: scannerOpen || scanSettingsOpen,
    searchInputRef: pickerSearchRef,
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
    <div
      ref={splitRef}
      className={`flex flex-col lg:flex-row gap-4 h-[calc(100dvh-6rem)] lg:h-[calc(100vh-6rem)] pb-[env(safe-area-inset-bottom)] ${dragging ? "select-none cursor-col-resize" : ""}`}
    >
      {/* Offline / pending-sync banner */}
      {(!offline.online || offline.pending > 0) && (
        <div className="lg:absolute lg:right-4 lg:top-0 z-20 flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <span>
            {offline.online ? "Back online" : "Offline"} ·{" "}
            {offline.pending > 0
              ? `${offline.pending} sale${offline.pending > 1 ? "s" : ""} waiting to sync`
              : "sales will be saved on this device"}
          </span>
          {offline.online && offline.pending > 0 && (
            <button
              type="button"
              className="underline underline-offset-2 disabled:opacity-50"
              disabled={offline.syncing}
              onClick={() => void offline.sync()}
            >
              {offline.syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      )}

      {/* Mobile: switch between the full-screen cart and the tender panel */}
      {isMobile && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setMobilePane("cart")}
            className={`rounded-md py-2 text-sm font-medium ${mobilePane === "cart" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Cart{pos.cart.length ? ` (${pos.cart.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("summary")}
            className={`rounded-md py-2 text-sm font-medium ${mobilePane === "summary" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Payment
          </button>
        </div>
      )}



      {/* Left: Product selection — resizable width on large screens */}
      <div
        className={`flex-col min-h-0 flex-1 lg:flex-none w-full ${
          isMobile && mobilePane !== "cart" ? "hidden lg:flex" : "flex"
        }`}
        style={isWide ? { width: `calc(${splitPct}% - 0.75rem)` } : undefined}
      >
        {/* Search & filters - single row on mobile */}
        <div className="flex flex-row gap-2 mb-3">
          <Button
            variant="outline"
            className="flex-1 justify-start gap-2 text-muted-foreground h-10"
            onClick={() => { setProductPickerOpen(true); requestAnimationFrame(() => pickerSearchRef.current?.focus()); }}
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Search or scan products…</span>
            <kbd className="ml-auto hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              F2
            </kbd>
          </Button>
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

        </div>

        {/* Product picker modal — opened by F2 or the search button */}
        <Dialog open={productPickerOpen} onOpenChange={(o) => {
          setProductPickerOpen(o);
          if (!o) { setPickerSearch(""); setCategoryFilter("all"); }
        }}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-4 py-3 border-b">
              <DialogTitle className="text-base">Select product</DialogTitle>
            </DialogHeader>
            <div className="flex flex-row gap-2 px-4 py-2 border-b">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={pickerSearchRef}
                  placeholder="Search by name, barcode or SKU…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setProductPickerOpen(false);
                      setPickerSearch("");
                      setCategoryFilter("all");
                      return;
                    }
                    if (e.key === "Enter" && pickerSearch.trim()) {
                      e.preventDefault();
                      // Enter-to-select: if the filter narrows to exactly one product, add it.
                      if (matchedProducts.length === 1) {
                        pos.addToCart(matchedProducts[0]);
                        setProductPickerOpen(false);
                        setPickerSearch("");
                        setCategoryFilter("all");
                        return;
                      }
                      // Otherwise treat as a barcode/SKU lookup.
                      const trimmed = pickerSearch.trim();
                      const match = products.find(
                        (p) => p.is_active && (p.barcode === trimmed || p.sku === trimmed)
                      );
                      if (match) {
                        pos.addToCart(match);
                        setProductPickerOpen(false);
                        setPickerSearch("");
                        setCategoryFilter("all");
                      } else {
                        toast.warning(`No product matches "${trimmed}"`);
                      }
                    }
                  }}
                  className="pl-9 pr-9"
                  aria-label="Search products by name, barcode or SKU"
                />
                {pickerSearch ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    title="Clear search"
                    onClick={() => { setPickerSearch(""); pickerSearchRef.current?.focus(); }}
                    className="absolute right-2 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-32 sm:w-40 shrink-0">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground sticky top-0">
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
                        onClick={() => { pos.addToCart(p); setProductPickerOpen(false); setPickerSearch(""); setCategoryFilter("all"); }}
                        className="cursor-pointer border-b last:border-0 hover:bg-accent/60 transition-colors"
                      >
                        <td className="px-3 py-2 align-middle">
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
                          <td className="px-3 py-2 align-middle hidden sm:table-cell">
                            <Badge variant={lowStock ? "destructive" : "secondary"} className="text-[10px] font-normal">
                              {qty}
                            </Badge>
                          </td>
                        )}
                        <td className="px-3 py-2 align-middle text-right font-semibold text-primary whitespace-nowrap">
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
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* PRODUCT ITEMS — the current sale's cart */}
        <div className="flex-1 min-h-0 flex flex-col rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-primary text-primary-foreground">
            <span className="text-xs font-semibold tracking-wide uppercase flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Product Items ({pos.cart.length})
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/15"
              disabled={pos.cart.length === 0}
              onClick={pos.clearCart}
              title="Clear cart"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            {pos.cart.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground text-sm">
                Search or scan a product to start a sale
              </p>
            ) : (
              <CartTable
                items={pos.cart}
                onUpdate={pos.updateCartItem}
                onRemove={pos.removeFromCart}
                onBeforeRemove={handleBeforeRemove}
                stockOf={pos.stockOf}
              />
            )}
          </ScrollArea>
        </div>





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

      {/* Drag handle to resize product list vs summary */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize product list and cart"
        title={canSetTenantDefault ? "Drag to resize · double-click to reset · right-click to save as the business default" : "Drag to resize · double-click to reset"}
        onMouseDown={() => setDragging(true)}
        onTouchStart={() => setDragging(true)}
        onDoubleClick={() => setSplitPct(SPLIT_FALLBACK)}
        onContextMenu={(e) => { e.preventDefault(); void saveTenantSplit(); }}
        className="hidden lg:flex -mx-3 w-6 shrink-0 cursor-col-resize items-center justify-center group"
      >
        <div className={`h-16 w-1.5 rounded-full transition-colors ${dragging ? "bg-primary" : "bg-border group-hover:bg-primary/60"}`} />
      </div>

      {/* Right: Sale summary & tender panel */}
      <div
        className={`w-full shrink-0 lg:flex-1 min-w-0 flex-col min-h-0 rounded-lg overflow-hidden bg-primary text-primary-foreground ${
          isMobile && mobilePane !== "summary" ? "hidden lg:flex" : "flex"
        }`}
        style={isWide ? { width: `calc(${100 - splitPct}% - 0.75rem)` } : undefined}
      >
        {/* Quick actions */}
        <div className="grid grid-cols-3 divide-x divide-primary-foreground/20 border-b border-primary-foreground/20">
          <button
            type="button"
            onClick={pos.clearCart}
            className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium hover:bg-primary-foreground/10"
          >
            <Plus className="h-4 w-4" /> New
          </button>
          <button
            type="button"
            disabled={isResume ? pos.heldSales.length === 0 : pos.cart.length === 0}
            onClick={() => {
              if (isResume) { setResumeOpen(true); return; }
              const suggested = pos.customerName || `Sale ${new Date().toLocaleTimeString()}`;
              const label = window.prompt("Name this parked sale:", suggested);
              if (label === null) return;
              void pos.holdSale(label);
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium hover:bg-primary-foreground/10 disabled:opacity-50"
          >
            {isResume ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {isResume ? `Resume${pos.heldSales.length ? ` (${pos.heldSales.length})` : ""}` : "Draft"}
          </button>
          <button
            type="button"
            onClick={() => setCreditCustomerOpen(true)}
            className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium hover:bg-primary-foreground/10"
          >
            <User className="h-4 w-4" /> New Customer
          </button>
        </div>

        {/* Session bar */}
        <div className="px-3 py-2 text-[11px] bg-primary-foreground/10 border-b border-primary-foreground/20 text-center truncate">
          {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          {" | "}{currentLocation?.name || ""}
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 text-white text-xs font-mono">
            {/* Invoice & Customer */}

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="opacity-80">Invoice</span>
                <span className="opacity-90">Pending</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="opacity-80 whitespace-nowrap">Customer</span>
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
                  <SelectTrigger className="h-7 w-full bg-transparent border-white/30 text-white text-xs px-2 py-1">
                    <SelectValue placeholder="Walk-in" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkin">Walk-in</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-dashed border-white/30 my-2" />

            {/* Cart items */}
            {pos.cart.length === 0 ? (
              <p className="text-center py-6 opacity-80">No items added yet</p>
            ) : (
              <table className="w-full mb-1">
                <tbody>
                  {pos.cart.map((item) => (
                    <tr key={item.product.id}>
                      <td className="py-1 align-top">
                        <div className="font-medium">{item.product.name}</div>
                        <div className="opacity-80">
                          {item.quantity} x {Number(item.unit_price).toLocaleString()}
                          {item.discount > 0 && <span className="ml-1 opacity-70">(disc -{item.discount})</span>}
                        </div>
                      </td>
                      <td className="py-1 text-right align-top whitespace-nowrap">
                        {(item.quantity * item.unit_price - item.discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>
        </ScrollArea>

        {/* Total */}
        <div className="px-3 py-2 border-t border-primary-foreground/20 flex items-center justify-between bg-primary">
          <span className="uppercase font-semibold tracking-wide text-sm">Total Due</span>
          <span className="text-3xl font-bold tabular-nums">
            <span className="text-base font-semibold mr-1 opacity-80">KES</span>
            {pos.cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Tender buttons */}
        <div className="p-3 pt-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-12 bg-primary-foreground text-primary border-transparent hover:bg-primary-foreground/90 font-semibold"
              disabled={pos.cart.length === 0}
              onClick={() => { setInitialPaymentMethod("cash"); setPaymentOpen(true); }}
            >
              <Banknote className="h-4 w-4 mr-1.5" /> Cash
            </Button>
            <Button
              variant="outline"
              className="h-12 bg-primary-foreground text-primary border-transparent hover:bg-primary-foreground/90 font-semibold"
              disabled={pos.cart.length === 0}
              onClick={() => { setInitialPaymentMethod("mpesa"); setPaymentOpen(true); }}
            >
              <Smartphone className="h-4 w-4 mr-1.5" /> M-Pesa
            </Button>
            <Button
              variant="outline"
              className="h-12 bg-primary-foreground text-primary border-transparent hover:bg-primary-foreground/90 font-semibold"
              disabled={pos.cart.length === 0}
              onClick={() => {
                if (!pos.customerId) { setCreditCustomerOpen(true); return; }
                setInitialPaymentMethod("card");
                setPaymentOpen(true);
              }}
            >
              <User className="h-4 w-4 mr-1.5" /> Credit
            </Button>
            <Button
              variant="outline"
              className="h-12 bg-primary-foreground text-primary border-transparent hover:bg-primary-foreground/90 font-semibold"
              disabled={isResume ? pos.heldSales.length === 0 : pos.cart.length === 0}
              onClick={() => {
                if (isResume) { setResumeOpen(true); return; }
                const suggested = pos.customerName || `Sale ${new Date().toLocaleTimeString()}`;
                const label = window.prompt("Name this parked sale:", suggested);
                if (label === null) return;
                void pos.holdSale(label);
              }}
            >
              {isResume ? <Play className="h-4 w-4 mr-1.5" /> : <Pause className="h-4 w-4 mr-1.5" />}
              {isResume ? "Resume" : "Suspend"}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-10 text-xs text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => {
              const last = loadLastReceipt(business?.id);
              if (!last) {
                toast.error("No previous receipt found on this device.");
                return;
              }
              setReprintData(last);
              setReprintOpen(true);
            }}
          >
            <Printer className="h-3.5 w-3.5 mr-1" /> Reprint Last Receipt
          </Button>
        </div>
      </div>


      <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Resume a suspended sale</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {pos.heldSales.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No suspended sales.</p>
            )}
            {pos.heldSales.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{h.label}</p>
                  <p className="text-xs text-muted-foreground">{h.cart?.length ?? 0} item(s)</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" onClick={() => { pos.resumeSale(h.id); setResumeOpen(false); }}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Resume
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pos.removeHeldSale(h.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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

      <ReceiptDialog
        open={reprintOpen}
        onOpenChange={setReprintOpen}
        data={reprintData}
        reprint
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

      <CreditCustomerDialog
        open={creditCustomerOpen}
        onOpenChange={setCreditCustomerOpen}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        onSelected={(c) => {
          pos.setCustomerId(c.id);
          pos.setCustomerName(c.name);
          setInitialPaymentMethod("card");
          setPaymentOpen(true);
        }}
      />


    </div>
  );
};

export default POS;
