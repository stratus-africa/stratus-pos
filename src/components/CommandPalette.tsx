import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Receipt,
  Users,
  TruckIcon,
  Truck,
  CreditCard,
  BarChart3,
  Settings,
  BookOpen,
  Landmark,
  UserCircle,
  Bell,
  ShieldCheck,
  Store,
  Bookmark,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useBusiness } from "@/contexts/BusinessContext";

type NavEntry = {
  label: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  group: "Navigate" | "Actions" | "Admin";
  keywords?: string;
};

const ENTRIES: NavEntry[] = [
  { label: "Dashboard", url: "/", icon: LayoutDashboard, group: "Navigate", permission: "dashboard.view" },
  { label: "POS / Sell", url: "/pos", icon: ShoppingCart, group: "Navigate", permission: "pos.view", keywords: "checkout sell register" },
  { label: "Products", url: "/products", icon: Package, group: "Navigate", permission: "products.view" },
  { label: "Inventory", url: "/inventory", icon: Warehouse, group: "Navigate", permission: "inventory.view", keywords: "stock" },
  { label: "Sales / Transactions", url: "/sales", icon: Receipt, group: "Navigate", permission: "sales.view", keywords: "invoices" },
  { label: "Customers", url: "/customers", icon: Users, group: "Navigate", permission: "customers.view" },
  { label: "Purchases", url: "/purchases", icon: TruckIcon, group: "Navigate", permission: "purchases.view" },
  { label: "Suppliers", url: "/suppliers", icon: Truck, group: "Navigate", permission: "suppliers.view" },
  { label: "Expenses", url: "/expenses", icon: CreditCard, group: "Navigate", permission: "expenses.view" },
  { label: "Reports", url: "/reports", icon: BarChart3, group: "Navigate", permission: "report.sales" },
  { label: "Banking", url: "/banking", icon: Landmark, group: "Navigate", permission: "banking.view" },
  { label: "Chart of Accounts", url: "/chart-of-accounts", icon: BookOpen, group: "Navigate", permission: "chart_of_accounts.view" },
  { label: "Journal Entries", url: "/journal-entries", icon: Bookmark, group: "Navigate", permission: "chart_of_accounts.view" },
  { label: "Tax Compliance", url: "/tax-compliance", icon: ShieldCheck, group: "Navigate", permission: "settings.view" },
  { label: "Notifications", url: "/notifications", icon: Bell, group: "Navigate" },
  { label: "Profile", url: "/profile", icon: UserCircle, group: "Navigate" },
  { label: "Settings", url: "/settings", icon: Settings, group: "Navigate", permission: "settings.view" },

  { label: "New Sale", url: "/pos", icon: ShoppingCart, group: "Actions", permission: "pos.view", keywords: "create checkout" },
  { label: "New Purchase Order", url: "/purchases/new", icon: TruckIcon, group: "Actions", permission: "purchases.create", keywords: "receive stock" },
  { label: "New Journal Entry", url: "/journal-entries?new=1", icon: BookOpen, group: "Actions", permission: "chart_of_accounts.view" },
];

const SUPER_ADMIN_ENTRIES: NavEntry[] = [
  { label: "Super Admin Dashboard", url: "/super-admin", icon: Store, group: "Admin" },
  { label: "Tenant Approvals", url: "/super-admin/tenant-approvals", icon: Users, group: "Admin" },
  { label: "Businesses", url: "/super-admin/businesses", icon: Store, group: "Admin" },
  { label: "Subscriptions", url: "/super-admin/subscriptions", icon: CreditCard, group: "Admin" },
  { label: "Packages", url: "/super-admin/packages", icon: Package, group: "Admin" },
  { label: "Landing CMS", url: "/super-admin/landing", icon: BookOpen, group: "Admin" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { isSuperAdmin } = useSuperAdmin();
  const { userRole } = useBusiness();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;

  const visible = ENTRIES.filter((e) => !e.permission || hasPermission(e.permission));
  const nav = visible.filter((e) => e.group === "Navigate");
  const actions = visible.filter((e) => e.group === "Actions");
  const admin = isSuperAdmin ? SUPER_ADMIN_ENTRIES : [];

  const go = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={`Search pages, actions… (${userRole ?? "user"})`} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {nav.length > 0 && (
          <CommandGroup heading="Navigate">
            {nav.map((e) => (
              <CommandItem key={"n:" + e.url + e.label} value={`${e.label} ${e.keywords ?? ""}`} onSelect={() => go(e.url)}>
                <e.icon className="mr-2 h-4 w-4" />
                {e.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {actions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {actions.map((e) => (
                <CommandItem key={"a:" + e.url + e.label} value={`${e.label} ${e.keywords ?? ""}`} onSelect={() => go(e.url)}>
                  <e.icon className="mr-2 h-4 w-4" />
                  {e.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {admin.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Super Admin">
              {admin.map((e) => (
                <CommandItem key={"s:" + e.url} value={e.label} onSelect={() => go(e.url)}>
                  <e.icon className="mr-2 h-4 w-4" />
                  {e.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
