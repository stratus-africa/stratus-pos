import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  TruckIcon,
  Receipt,
  Users,
  Truck,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Store,
  Shield,
  BookOpen,
  Landmark,
  Lock,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { useFeatureLimit } from "@/components/FeatureGate";
import { NavLink } from "@/components/NavLink";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

type AppRole = "admin" | "manager" | "cashier" | "stores_manager";

interface NavItem {
  title: string;
  url: string;
  icon: any;
  roles: AppRole[];
  /** Feature key from package_features. Item is locked when the user's plan doesn't have it. */
  featureKey?: string;
  /** Optional sub-items rendered under this item as a collapsible submenu. */
  children?: NavItem[];
}

const mainNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "manager"], featureKey: "dashboard" },
  { title: "POS", url: "/pos", icon: ShoppingCart, roles: ["admin", "manager", "cashier"], featureKey: "pos" },
];

const inventoryNav: NavItem[] = [
  { title: "Products", url: "/products", icon: Package, roles: ["admin", "manager"], featureKey: "products" },
  { title: "Inventory", url: "/inventory", icon: Warehouse, roles: ["admin", "manager"], featureKey: "inventory" },
];

const transactionNav: NavItem[] = [
  {
    title: "Sales", url: "/sales", icon: Receipt, roles: ["admin", "manager"], featureKey: "sales",
    children: [
      { title: "Customers", url: "/customers", icon: Users, roles: ["admin", "manager"], featureKey: "sales" },
    ],
  },
  {
    title: "Purchases", url: "/purchases", icon: TruckIcon, roles: ["admin", "manager"], featureKey: "purchases",
    children: [
      { title: "Suppliers", url: "/suppliers", icon: Truck, roles: ["admin", "manager"], featureKey: "purchases" },
    ],
  },
  { title: "Expenses", url: "/expenses", icon: CreditCard, roles: ["admin"], featureKey: "expenses" },
];

const financeNav: NavItem[] = [
  { title: "Accountant", url: "/chart-of-accounts", icon: BookOpen, roles: ["admin"], featureKey: "chart_of_accounts" },
  { title: "Journal Entries", url: "/journal-entries", icon: BookOpen, roles: ["admin"], featureKey: "chart_of_accounts" },
  { title: "Banking", url: "/banking", icon: Landmark, roles: ["admin"], featureKey: "banking" },
];

const systemNav: NavItem[] = [
  { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin"], featureKey: "reports" },
  { title: "Profile", url: "/profile", icon: UserCircle, roles: ["admin", "manager", "cashier"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const { business, userRole } = useBusiness();
  const { isSuperAdmin } = useSuperAdmin();
  const { hasFeatureKey } = useFeatureLimit();
  const currentPath = location.pathname;

  const filterByRole = (items: NavItem[]) =>
    items.filter((item) => userRole && item.roles.includes(userRole));

  const renderNav = (items: NavItem[], label: string) => {
    const filtered = filterByRole(items);
    if (filtered.length === 0) return null;

    const isActiveUrl = (url: string) => currentPath === url;
    const itemHasActiveChild = (item: NavItem) =>
      !!item.children?.some((c) => isActiveUrl(c.url));

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {filtered.map((item) => {
              const locked = item.featureKey ? !hasFeatureKey(item.featureKey) : false;
              const visibleChildren = (item.children || []).filter(
                (c) => userRole && c.roles.includes(userRole),
              );
              const hasChildren = visibleChildren.length > 0;
              const parentActive = isActiveUrl(item.url) || itemHasActiveChild(item);

              if (!hasChildren) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActiveUrl(item.url)}>
                      <NavLink to={item.url} end className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && locked && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              // Item with children -> collapsible submenu
              return (
                <Collapsible key={item.title} defaultOpen={parentActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <div className="flex items-center w-full">
                      <SidebarMenuButton asChild isActive={isActiveUrl(item.url)} className="flex-1">
                        <NavLink to={item.url} end className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                          <item.icon className="mr-2 h-4 w-4" />
                          {!collapsed && <span className="flex-1">{item.title}</span>}
                          {!collapsed && locked && <Lock className="mr-1 h-3 w-3 text-muted-foreground" />}
                        </NavLink>
                      </SidebarMenuButton>
                      {!collapsed && (
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Toggle ${item.title} submenu`}
                            className="ml-1 p-1.5 rounded hover:bg-sidebar-accent/70 text-sidebar-foreground/70"
                          >
                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                          </button>
                        </CollapsibleTrigger>
                      )}
                    </div>
                    {!collapsed && (
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {visibleChildren.map((child) => {
                            const childLocked = child.featureKey ? !hasFeatureKey(child.featureKey) : false;
                            return (
                              <SidebarMenuSubItem key={child.title}>
                                <SidebarMenuSubButton asChild isActive={isActiveUrl(child.url)}>
                                  <NavLink to={child.url} end className="hover:bg-sidebar-accent/50">
                                    <child.icon className="mr-2 h-3.5 w-3.5" />
                                    <span>{child.title}</span>
                                    {childLocked && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    )}
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Store className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold tracking-tight text-sidebar-foreground">StratusPOS</span>
              {business && (
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                  {business.name}
                </span>
              )}
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderNav(mainNav, "Main")}
        {renderNav(inventoryNav, "Inventory")}
        {renderNav(transactionNav, "Transactions")}
        {renderNav(financeNav, "Finance")}
        {renderNav(systemNav, "System")}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        {!collapsed && isSuperAdmin && (
          <Link
            to="/super-admin"
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <Shield className="h-3.5 w-3.5" />
            Super Admin Panel
          </Link>
        )}
        {!collapsed && userRole && (
          <div className="px-2 pb-1">
            <Badge variant="outline" className="text-xs capitalize w-full justify-center">
              {userRole}
            </Badge>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
