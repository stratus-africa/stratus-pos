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

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const { userRole } = useBusiness();
  const { hasFeatureKey } = useFeatureLimit();
  const { enabled: digitaxEnabled } = useDigitaxEnabled();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

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

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname === to || location.pathname.startsWith(to + "/");

  // Primary quick-access tabs: the active item is always kept visible in the bar.
  const quick = (() => {
    const first = items.slice(0, 4);
    if (first.some((i) => isActive(i.to))) return first;
    const current = items.find((i) => isActive(i.to));
    return current ? [current, ...first.slice(0, 3)] : first;
  })();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      aria-label="Primary"
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <div className="mx-auto flex max-w-md items-stretch justify-around rounded-[1.75rem] border border-border/60 bg-card/95 px-2 py-2 shadow-[0_10px_30px_-10px_hsl(var(--foreground)/0.25)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
          {quick.map((it) => {
            const active = isActive(it.to);
            return (
              <Link
                key={`${it.to}-${it.label}`}
                to={it.to}
                aria-current={active ? "page" : undefined}
                className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1 px-1 pt-1"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                    active
                      ? "-translate-y-3 bg-primary/10 text-primary ring-4 ring-background"
                      : "text-muted-foreground group-active:bg-muted"
                  }`}
                >
                  <it.icon className="h-5 w-5" />
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
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors group-active:bg-muted">
                <Menu className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-muted-foreground">More</span>
            </button>
          </SheetTrigger>
        </div>

        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4 text-primary" /> Navigation
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {items.map((it) => {
                const active = isActive(it.to);
                return (
                  <li key={`${it.to}-${it.label}`}>
                    <Link
                      to={it.to}
                      onClick={() => setOpen(false)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3 aspect-square text-center transition-colors ${
                        active
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-card hover:bg-muted border-border text-foreground"
                      }`}
                    >
                      <it.icon className="h-6 w-6" />
                      <span className="text-[11px] font-medium leading-tight line-clamp-2">{it.label}</span>
                    </Link>
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

