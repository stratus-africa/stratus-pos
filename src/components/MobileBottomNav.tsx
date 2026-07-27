import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, TruckIcon, Receipt,
  Users, Truck, CreditCard, BarChart3, Settings, Store, BookOpen, Landmark,
  ShieldCheck, UserCircle, UserCog, Menu, LogOut, Check, RotateCcw, SlidersHorizontal,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import { useFeatureLimit } from "@/components/FeatureGate";
import { useDigitaxEnabled } from "@/hooks/useDigitax";
import { useAuth } from "@/contexts/AuthContext";
import { useNavBadges, useQuickTabPrefs, matchesRoute, bestMatch } from "@/hooks/useMobileNav";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";


type AppRole = "admin" | "manager" | "cashier" | "stores_manager";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
  permission?: string;
  anyPermission?: string[];
  featureKey?: string;
  hideForRoles?: AppRole[];
};

// Flat mirror of AppSidebar navigation (children flattened).
const NAV: Item[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin","manager","cashier"], featureKey: "dashboard", permission: "dashboard.view" },
  { to: "/pos", label: "POS", icon: ShoppingCart, roles: ["admin","manager","cashier"], featureKey: "pos", permission: "pos.view" },
  { to: "/sales", label: "My Transactions", icon: Receipt, roles: ["cashier"], featureKey: "sales", permission: "sales.view" },
  { to: "/products", label: "Products", icon: Package, roles: ["admin","manager","cashier"], featureKey: "products", permission: "products.view" },
  { to: "/inventory", label: "Inventory", icon: Warehouse, roles: ["admin","manager","cashier"], featureKey: "inventory", permission: "inventory.view" },
  { to: "/sales", label: "Sales", icon: Receipt, roles: ["admin","manager"], featureKey: "sales", permission: "sales.view", hideForRoles: ["cashier"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["admin","manager","cashier"], permission: "customers.view" },
  { to: "/purchases", label: "Purchases", icon: TruckIcon, roles: ["admin","manager","cashier"], featureKey: "purchases", permission: "purchases.view" },
  { to: "/suppliers", label: "Suppliers", icon: Truck, roles: ["admin","manager","cashier"], featureKey: "purchases", permission: "suppliers.view" },
  { to: "/expenses", label: "Expenses", icon: CreditCard, roles: ["admin","manager","cashier"], featureKey: "expenses", permission: "expenses.view" },
  { to: "/chart-of-accounts", label: "Accountant", icon: BookOpen, roles: ["admin"], featureKey: "chart_of_accounts", permission: "chart_of_accounts.view" },
  { to: "/journal-entries", label: "Journals", icon: BookOpen, roles: ["admin"], featureKey: "chart_of_accounts", permission: "chart_of_accounts.view" },
  { to: "/banking", label: "Banking", icon: Landmark, roles: ["admin"], featureKey: "banking", permission: "banking.view" },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin","manager","cashier","stores_manager"], featureKey: "reports", anyPermission: ["report.sales","report.purchases","report.expenses","report.inventory","report.pnl","report.audit"] },
  { to: "/hr", label: "HR", icon: UserCog, roles: ["admin","manager","cashier","stores_manager"], featureKey: "hr", permission: "hr.view" },
  { to: "/tax-compliance", label: "Tax", icon: ShieldCheck, roles: ["admin","manager"], featureKey: "digitax", permission: "settings.view" },
  { to: "/profile", label: "Profile", icon: UserCircle, roles: ["admin","manager","cashier"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"], permission: "settings.view" },
];

const MAX_QUICK = 4;
const keyOf = (i: Item) => `${i.to}|${i.label}`;

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { userRole } = useBusiness();
  const { hasFeatureKey } = useFeatureLimit();
  const { enabled: digitaxEnabled } = useDigitaxEnabled();
  const { signOut } = useAuth();
  const badges = useNavBadges();
  const { selected, toggle, reset, isCustomized } = useQuickTabPrefs(MAX_QUICK);
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (!isMobile || !userRole) return null;

  const isVisible = (i: Item) => {
    if (i.featureKey && !hasFeatureKey(i.featureKey)) return false;
    if (i.to === "/tax-compliance" && !digitaxEnabled) return false;
    if (i.hideForRoles?.includes(userRole)) return false;
    if (i.anyPermission?.length) return i.anyPermission.some((p) => hasPermission(p));
    if (i.permission) return hasPermission(i.permission);
    return i.roles.includes(userRole);
  };

  const items = NAV.filter(isVisible);

  // Resolve the single best route match so deep links (e.g. /inventory/counts/123,
  // /settings/business) light up exactly one tab.
  const activeTarget = bestMatch(items.map((i) => i.to), location.pathname);
  const isActive = (to: string) => activeTarget === to && matchesRoute(to, location.pathname);

  const chosen = selected
    .map((k) => items.find((i) => keyOf(i) === k))
    .filter((i): i is Item => Boolean(i));

  // Quick tabs: user preference first, otherwise the first few available modules.
  // The active module is always surfaced so the pill never looks unselected.
  const quick = (() => {
    const base = (chosen.length ? chosen : items.slice(0, MAX_QUICK)).slice(0, MAX_QUICK);
    if (base.some((i) => isActive(i.to))) return base;
    const current = items.find((i) => isActive(i.to));
    return current ? [current, ...base.slice(0, MAX_QUICK - 1)] : base;
  })();

  const badgeFor = (to: string) => {
    const root = "/" + (to.split("/").filter(Boolean)[0] ?? "");
    return to === "/" ? 0 : badges[root] ?? 0;
  };
  const quickBadged = quick.reduce((sum, i) => sum + badgeFor(i.to), 0);
  const moreBadge = Math.max(0, (badges.__total ?? 0) - quickBadged);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || quick.length < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const currentIndex = quick.findIndex((i) => isActive(i.to));
    const from = currentIndex === -1 ? 0 : currentIndex;
    const next = dx < 0 ? from + 1 : from - 1;
    if (next < 0 || next >= quick.length) return;
    navigate(quick[next].to);
  };

  const renderBadge = (count: number) =>
    count > 0 ? (
      <span className="absolute -right-1 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-card">
        {count > 99 ? "99+" : count}
      </span>
    ) : null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      aria-label="Primary"
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <div
          className="mx-auto flex max-w-md touch-pan-y items-stretch justify-around rounded-[1.75rem] border border-border/60 bg-card/95 px-2 py-2 shadow-[0_10px_30px_-10px_hsl(var(--foreground)/0.25)] backdrop-blur supports-[backdrop-filter]:bg-card/80"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {quick.map((it) => {
            const active = isActive(it.to);
            const count = badgeFor(it.to);
            return (
              <Link
                key={keyOf(it)}
                to={it.to}
                aria-current={active ? "page" : undefined}
                className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1 px-1 pt-1"
              >
                <span
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                    active
                      ? "-translate-y-3 bg-primary/10 text-primary ring-4 ring-background"
                      : "text-muted-foreground group-active:bg-muted"
                  }`}
                >
                  <it.icon className="h-5 w-5" />
                  {renderBadge(count)}
                </span>
                <span
                  className={`w-full truncate text-center text-[11px] leading-tight transition-colors ${
                    active ? "-mt-2 font-semibold text-primary" : "font-medium text-muted-foreground"
                  }`}
                >
                  {it.label}
                </span>
              </Link>
            );
          })}

          <SheetTrigger asChild>
            <button
              type="button"
              className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1 px-1 pt-1"
              aria-label="Open navigation menu"
            >
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors group-active:bg-muted">
                <Menu className="h-5 w-5" />
                {renderBadge(moreBadge)}
              </span>
              <span className="text-[11px] font-medium leading-tight text-muted-foreground">More</span>
            </button>
          </SheetTrigger>
        </div>

        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> {customizing ? "Choose quick tabs" : "Navigation"}
              </span>
              <span className="flex items-center gap-1">
                {customizing && isCustomized && (
                  <Button variant="ghost" size="sm" onClick={reset}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setCustomizing((c) => !c)}>
                  <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                  {customizing ? "Done" : "Customize"}
                </Button>
              </span>
            </SheetTitle>
          </SheetHeader>
          {customizing && (
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              Pick up to {MAX_QUICK} modules to pin to the bottom bar ({selected.length}/{MAX_QUICK} selected).
            </p>
          )}
          <div className="flex-1 overflow-y-auto p-4">
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {items.map((it) => {
                const k = keyOf(it);
                const active = isActive(it.to);
                const picked = selected.includes(k);
                const count = badgeFor(it.to);
                const highlight = customizing ? picked : active;
                const disabled = customizing && !picked && selected.length >= MAX_QUICK;
                const className = `relative flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-3 text-center transition-colors ${
                  highlight
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-card hover:bg-muted border-border text-foreground"
                } ${disabled ? "opacity-40" : ""}`;
                const inner = (
                  <>
                    <span className="relative">
                      <it.icon className="h-5 w-5" />
                      {!customizing && renderBadge(count)}
                      {customizing && picked && (
                        <span className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-medium leading-tight line-clamp-2">{it.label}</span>
                  </>
                );
                return (
                  <li key={k}>
                    {customizing ? (
                      <button
                        type="button"
                        aria-pressed={picked}
                        disabled={disabled}
                        onClick={() => toggle(k)}
                        className={className}
                      >
                        {inner}
                      </button>
                    ) : (
                      <Link to={it.to} onClick={() => setOpen(false)} className={className}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="border-t p-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}


