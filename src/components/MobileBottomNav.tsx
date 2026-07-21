import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Receipt, Warehouse, Menu } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/components/ui/sidebar";
import { usePermissions } from "@/hooks/usePermissions";
import { useBusiness } from "@/contexts/BusinessContext";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; permission?: string; match?: (p: string) => boolean };

const ITEMS: Item[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, match: (p) => p === "/" },
  { to: "/pos", label: "POS", icon: ShoppingCart, permission: "pos.view", match: (p) => p.startsWith("/pos") },
  { to: "/sales", label: "Sales", icon: Receipt, permission: "sales.view", match: (p) => p.startsWith("/sales") },
  { to: "/inventory", label: "Stock", icon: Warehouse, permission: "inventory.view", match: (p) => p.startsWith("/inventory") || p.startsWith("/products") },
];

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { hasPermission } = usePermissions();
  const { userRole } = useBusiness();

  if (!isMobile || !userRole) return null;

  const items = ITEMS.filter((i) => !i.permission || hasPermission(i.permission));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.match ? it.match(location.pathname) : location.pathname === it.to;
          return (
            <li key={it.to}>
              <NavLink
                to={it.to}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                end={it.to === "/"}
              >
                <it.icon className="h-5 w-5" />
                <span>{it.label}</span>
              </NavLink>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
