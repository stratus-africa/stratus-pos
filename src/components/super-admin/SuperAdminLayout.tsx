import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect as useEffectR } from "react";
import {
  LayoutDashboard,
  Building2,
  Tag,
  CreditCard,
  Shield,
  BarChart2,
  Receipt,
  Hourglass,
  FileText,
  PieChart,
  Globe,
  Sparkles,
  LayoutGrid,
  DollarSign,
  TrendingUp,
  Lightbulb,
  MessageSquare,
  HelpCircle,
  LogOut,
  PanelLeft,
  Bell,
  Menu,
  Zap,
  Megaphone,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = { title: string; url: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: [{ title: "Dashboard", url: "/super-admin", icon: LayoutDashboard }],
  },
  {
    label: "Management",
    items: [
      { title: "Tenants", url: "/super-admin/businesses", icon: Building2 },
      { title: "Tenant Approvals", url: "/super-admin/tenant-approvals", icon: UserCheck },
      { title: "Plans", url: "/super-admin/packages", icon: Tag },
      { title: "Modules", url: "/super-admin/modules", icon: LayoutGrid },
      { title: "Subscriptions", url: "/super-admin/subscriptions", icon: CreditCard },
      { title: "Super Admins", url: "/super-admin/users", icon: Shield },
    ],
  },
  {
    label: "Payments",
    items: [
      { title: "Overview", url: "/super-admin/payments", icon: BarChart2 },
      { title: "Transactions", url: "/super-admin/transactions", icon: Receipt },
    ],
  },
  {
    label: "Reports",
    items: [{ title: "Reports", url: "/super-admin/activity", icon: PieChart }],
  },
  {
    label: "CMS",
    items: [
      { title: "Hero Section", url: "/super-admin/cms/hero", icon: Sparkles },
      { title: "Features", url: "/super-admin/cms/features", icon: LayoutGrid },
      { title: "Pricing Section", url: "/super-admin/cms/pricing", icon: DollarSign },
      { title: "Stats / Trust Bar", url: "/super-admin/cms/stats", icon: TrendingUp },
      { title: "How It Works", url: "/super-admin/cms/how-it-works", icon: Lightbulb },
      { title: "Testimonials", url: "/super-admin/cms/testimonials", icon: MessageSquare },
      { title: "FAQ", url: "/super-admin/cms/faq", icon: HelpCircle },
      { title: "Call To Action", url: "/super-admin/cms/cta", icon: Zap },
    ],
  },
  {
    label: "System",
    items: [
      { title: "General Settings", url: "/super-admin/settings", icon: Settings2 },
      { title: "Announcements", url: "/super-admin/announcements", icon: Megaphone },
    ],
  },
];

const mobileNavGroups = navGroups
  .filter((group) => group.label !== "Main")
  .map((group) => ({ ...group, mobileLabel: group.label === "System" ? "Settings" : group.label }));

export function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSection, setMobileSection] = useState("Management");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAllMobileMenus, setShowAllMobileMenus] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffectR(() => {
    const load = async () => {
      const { data } = await (supabase as any).rpc("list_tenant_approvals", { _status: "pending", _search: null });
      setPendingCount(Array.isArray(data) ? data.length : 0);
    };
    void load();
    const ch = supabase
      .channel("sa-pending-approvals")
      .on("postgres_changes", { event: "*", schema: "public", table: "businesses" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const sidebarVisible = !isMobile;
  const userName = (user?.user_metadata as any)?.full_name || "Super Admin";

  const isActive = (url: string) => {
    if (url === "/super-admin") return location.pathname === "/super-admin";
    return location.pathname.startsWith(url);
  };

  const selectedMobileGroup = mobileNavGroups.find((group) => group.label === mobileSection) || mobileNavGroups[0];
  const SelectedMobileGroupIcon = selectedMobileGroup?.items[0]?.icon;

  useEffectR(() => {
    const activeGroup = mobileNavGroups.find((group) =>
      group.items.some((item) =>
        item.url === "/super-admin" ? location.pathname === "/super-admin" : location.pathname.startsWith(item.url),
      ),
    );
    if (activeGroup) setMobileSection(activeGroup.label);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-[hsl(210_20%_98%)]">
      {sidebarVisible && (
        <aside
          className={cn(
            "bg-white border-r border-border flex flex-col transition-[width] duration-200",
            isMobile ? "fixed inset-y-0 left-0 z-40 w-64" : "w-64",
          )}
        >
          {/* Brand */}
          <div className="px-5 py-5 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-xs">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight">StratusPOS</span>
          </div>

          {/* Nav groups */}
          <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.url);
                    return (
                      <Link
                        key={item.url}
                        to={item.url}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                          active
                            ? "bg-emerald-50 text-emerald-700 font-medium"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0", active && "text-emerald-600")} />
                        <span className="truncate flex-1">{item.title}</span>
                        {item.url === "/super-admin/tenant-approvals" && pendingCount > 0 && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {pendingCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-3 border-t border-border">
            <Button variant="outline" className="w-full justify-center gap-2 text-sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex min-w-0 flex-col">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 sm:inline-flex"
              onClick={() => setCollapsed((c) => !c)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-foreground/60" title="Quick Actions">
                  <Zap className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Actions
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/super-admin/businesses")}>
                  <Building2 className="h-4 w-4 mr-2 text-emerald-600" /> Tenants
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/super-admin/packages/new")}>
                  <Plus className="h-4 w-4 mr-2 text-emerald-600" /> New plan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/super-admin/subscriptions")}>
                  <CreditCard className="h-4 w-4 mr-2 text-emerald-600" /> Subscriptions
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationBell />

            <div className="flex items-center gap-2 pl-2 ml-1">
              <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-semibold">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:block text-sm font-medium">{userName}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 pb-32 sm:p-6">{children}</main>
      </div>

      {isMobile && selectedMobileGroup && (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <nav
            className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
            aria-label="Super admin navigation"
          >
            <div className="mx-auto grid max-w-md grid-cols-5 items-end rounded-[1.75rem] border border-border/60 bg-card/95 px-2 py-2 shadow-[0_10px_30px_-10px_hsl(var(--foreground)/0.25)] backdrop-blur">
              {mobileNavGroups.slice(0, 4).map((group) => {
                const active = group.label === mobileSection;
                const Icon = group.items[0].icon;
                return (
                  <button
                    key={group.label}
                    type="button"
                    aria-expanded={active && mobileMenuOpen}
                    onClick={() => {
                      setMobileSection(group.label);
                      setShowAllMobileMenus(false);
                      setMobileMenuOpen(true);
                    }}
                    className={cn(
                      "group flex min-w-0 flex-col items-center justify-end gap-0.5 px-1 pt-1 text-[10px] font-medium",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full transition-all",
                        active
                          ? "-translate-y-2 bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background"
                          : "group-active:bg-muted",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={cn("truncate", active && "-mt-2 font-semibold")}>{group.mobileLabel}</span>
                  </button>
                );
              })}
              <button
                type="button"
                aria-label="Open more navigation"
                onClick={() => {
                  setShowAllMobileMenus(true);
                  setMobileMenuOpen(true);
                }}
                className="group flex min-w-0 flex-col items-center justify-end gap-0.5 px-1 pt-1 text-[10px] font-medium text-muted-foreground"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full transition-all group-active:bg-muted">
                  <Menu className="h-4 w-4" />
                </span>
                <span className="truncate">More</span>
              </button>
            </div>
          </nav>

          <SheetContent side="bottom" className="flex max-h-[80vh] flex-col rounded-t-2xl p-0">
            <SheetHeader className="border-b px-4 py-3 text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                {showAllMobileMenus ? (
                  <Menu className="h-4 w-4 text-primary" />
                ) : (
                  SelectedMobileGroupIcon && <SelectedMobileGroupIcon className="h-4 w-4 text-primary" />
                )}
                {showAllMobileMenus ? "Navigation" : selectedMobileGroup.mobileLabel}
              </SheetTitle>
            </SheetHeader>
            <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto px-4 py-3 sm:grid-cols-4">
              {showAllMobileMenus ? (
                <>
                  <Link
                    to="/super-admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center text-xs font-medium transition-colors",
                      isActive("/super-admin")
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    <LayoutDashboard className="h-5 w-5" />
                    <span>Dashboard</span>
                  </Link>
                  {mobileNavGroups.map((group) => {
                    const Icon = group.items[0].icon;
                    return (
                      <button
                        key={group.label}
                        type="button"
                        onClick={() => {
                          setMobileSection(group.label);
                          setShowAllMobileMenus(false);
                        }}
                        className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border bg-card px-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <Icon className="h-5 w-5" />
                        <span>{group.mobileLabel}</span>
                      </button>
                    );
                  })}
                </>
              ) : (
                selectedMobileGroup.items.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <Link
                      key={item.url}
                      to={item.url}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center text-xs font-medium transition-colors",
                        active ? "border-primary bg-primary/10 text-primary" : "bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="line-clamp-2">{item.title}</span>
                    </Link>
                  );
                })
              )}
            </div>
            <div className="border-t p-3">
              <Button variant="outline" className="w-full" onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
