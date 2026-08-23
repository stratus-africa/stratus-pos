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
  HeartPulse,
  Flag,
  Headset,
  DatabaseBackup,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronDown, Command } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = { title: string; url: string; icon: React.ElementType; children?: NavItem[] };
type NavGroup = { label: string; items: NavItem[] };

const GROUP_ICONS: Record<string, React.ElementType> = {
  PLATFORM: Building2,
  BILLING: CreditCard,
  MONITORING: HeartPulse,
  COMMUNICATION: Megaphone,
  WEBSITE: Globe,
  SYSTEM: Settings2,
};

const CMS_ITEMS: NavItem[] = [
  { title: "Hero", url: "/super-admin/cms/hero", icon: Sparkles },
  { title: "Features", url: "/super-admin/cms/features", icon: LayoutGrid },
  { title: "Pricing", url: "/super-admin/cms/pricing", icon: DollarSign },
  { title: "Stats", url: "/super-admin/cms/stats", icon: TrendingUp },
  { title: "How It Works", url: "/super-admin/cms/how-it-works", icon: Lightbulb },
  { title: "Testimonials", url: "/super-admin/cms/testimonials", icon: MessageSquare },
  { title: "FAQ", url: "/super-admin/cms/faq", icon: HelpCircle },
  { title: "CTA", url: "/super-admin/cms/cta", icon: Zap },
];

const navGroups: NavGroup[] = [
  {
    label: "PLATFORM",
    items: [
      { title: "Tenants", url: "/super-admin/businesses", icon: Building2 },
      { title: "Approvals", url: "/super-admin/tenant-approvals", icon: UserCheck },
      { title: "Users & Super Admins", url: "/super-admin/users", icon: Shield },
      { title: "Modules", url: "/super-admin/modules", icon: LayoutGrid },
      { title: "Feature Flags", url: "/super-admin/feature-flags", icon: Flag },
    ],
  },
  {
    label: "BILLING",
    items: [
      { title: "Subscriptions", url: "/super-admin/subscriptions", icon: CreditCard },
      { title: "Payments", url: "/super-admin/payments", icon: BarChart2 },
      { title: "Plans", url: "/super-admin/packages", icon: Tag },
      { title: "Revenue", url: "/super-admin/revenue", icon: TrendingUp },
      { title: "Transactions", url: "/super-admin/transactions", icon: Receipt },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { title: "Platform Health", url: "/super-admin/health", icon: HeartPulse },
      { title: "Audit Log", url: "/super-admin/activity", icon: FileText },
      { title: "Security", url: "/super-admin/security", icon: Shield },
      { title: "System Jobs", url: "/super-admin/enterprise", icon: DatabaseBackup },
      {
        title: "Support / Impersonation",
        url: "/super-admin/support",
        icon: Headset,
      },
    ],
  },
  {
    label: "COMMUNICATION",
    items: [
      { title: "Announcements", url: "/super-admin/announcements", icon: Megaphone },
      { title: "Notifications", url: "/super-admin/notifications", icon: Bell },
    ],
  },
  {
    label: "WEBSITE",
    items: [{ title: "CMS", url: "/super-admin/cms/hero", icon: Globe, children: CMS_ITEMS }],
  },
  {
    label: "SYSTEM",
    items: [
      { title: "Settings", url: "/super-admin/settings", icon: Settings2 },
      { title: "Integrations", url: "/super-admin/integrations", icon: Zap },
      { title: "Backups", url: "/super-admin/enterprise", icon: DatabaseBackup },
    ],
  },
];

const mobileNavGroups = navGroups.map((group) => ({
  ...group,
  mobileLabel: group.label,
}));

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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map((g) => [g.label, true])),
  );
  const [cmsOpen, setCmsOpen] = useState(false);

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
    <div className="flex min-h-screen bg-background text-foreground">
      {sidebarVisible && (
        <aside
          className={cn(
            "bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-[width] duration-200 shadow-[1px_0_0_hsl(var(--border))]",
            isMobile ? "fixed inset-y-0 left-0 z-40 w-72" : collapsed ? "w-[72px]" : "w-64",
          )}
        >
          {/* Brand */}
          <div className={cn("px-4 py-5 flex items-center", collapsed && !isMobile ? "justify-center" : "gap-2.5")}>
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <Zap className="h-4 w-4" />
            </div>
            {(!collapsed || isMobile) && (
              <div className="min-w-0">
                <span className="block text-sm font-bold tracking-tight text-sidebar-foreground">StratusPOS</span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/45">
                  Super Admin
                </span>
              </div>
            )}
          </div>

          {/* Nav groups */}
          <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
            <Link
              to="/super-admin"
              className={cn(
                "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                collapsed && !isMobile && "justify-center px-0",
                location.pathname === "/super-admin"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <LayoutDashboard
                className={cn("h-4 w-4 shrink-0", location.pathname === "/super-admin" && "text-primary")}
              />
              {(!collapsed || isMobile) && <span>Dashboard</span>}
            </Link>

            {navGroups.map((group) => {
              const GroupIcon = GROUP_ICONS[group.label] || LayoutGrid;
              const isOpen = openGroups[group.label];
              const hasActive = group.items.some(
                (item) => isActive(item.url) || item.children?.some((child) => isActive(child.url)),
              );
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() =>
                      !collapsed && setOpenGroups((prev) => ({ ...prev, [group.label]: !prev[group.label] }))
                    }
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-sidebar-foreground transition-colors",
                      hasActive && "text-primary",
                      collapsed && !isMobile && "justify-center px-0",
                    )}
                    title={collapsed && !isMobile ? group.label : undefined}
                  >
                    <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                    {(!collapsed || isMobile) && (
                      <>
                        <span className="flex-1 text-left">{group.label}</span>
                        <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
                      </>
                    )}
                  </button>

                  {(isOpen || (collapsed && !isMobile)) && (
                    <div className="mt-1 space-y-0.5">
                      {group.items.map((item) => {
                        const active = isActive(item.url) || !!item.children?.some((child) => isActive(child.url));
                        const hasChildren = !!item.children?.length;
                        return (
                          <div key={item.title}>
                            {hasChildren ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => !collapsed && setCmsOpen((v) => !v)}
                                  className={cn(
                                    "w-full group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                                    collapsed && !isMobile && "justify-center px-0",
                                    active
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                  )}
                                >
                                  <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                                  {(!collapsed || isMobile) && (
                                    <>
                                      <span className="truncate flex-1 text-left">{item.title}</span>
                                      <ChevronDown
                                        className={cn("h-3.5 w-3.5 transition-transform", cmsOpen && "rotate-180")}
                                      />
                                    </>
                                  )}
                                </button>
                                {cmsOpen && (!collapsed || isMobile) && (
                                  <div className="ml-7 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                                    {item.children!.map((child) => {
                                      const childActive = isActive(child.url);
                                      return (
                                        <Link
                                          key={child.url}
                                          to={child.url}
                                          className={cn(
                                            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                                            childActive
                                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                          )}
                                        >
                                          <child.icon
                                            className={cn("h-3.5 w-3.5 shrink-0", childActive && "text-primary")}
                                          />
                                          <span className="truncate">{child.title}</span>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <Link
                                to={item.url}
                                className={cn(
                                  "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                                  collapsed && !isMobile && "justify-center px-0",
                                  active
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                                )}
                              >
                                <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                                {(!collapsed || isMobile) && <span className="truncate flex-1">{item.title}</span>}
                                {(!collapsed || isMobile) &&
                                  item.url === "/super-admin/tenant-approvals" &&
                                  pendingCount > 0 && (
                                    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                                      {pendingCount}
                                    </span>
                                  )}
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="p-3 border-t border-border/60">
            <Button
              variant="outline"
              className={cn("w-full justify-center gap-2 text-sm bg-background/40", collapsed && !isMobile && "px-0")}
              onClick={signOut}
              title={collapsed && !isMobile ? "Log out" : undefined}
            >
              <LogOut className="h-4 w-4" />
              {(!collapsed || isMobile) && "Log out"}
            </Button>
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex min-w-0 flex-col">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 sm:inline-flex hover:bg-muted"
              onClick={() => setCollapsed((c) => !c)}
            >
              <PanelLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            </Button>
            <div className="hidden md:flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
              <Command className="h-3.5 w-3.5" />
              <span>Quick search</span>
              <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
            </div>
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
                  <Building2 className="h-4 w-4 mr-2 text-primary" /> Tenants
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/super-admin/packages/new")}>
                  <Plus className="h-4 w-4 mr-2 text-primary" /> New plan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/super-admin/subscriptions")}>
                  <CreditCard className="h-4 w-4 mr-2 text-primary" /> Subscriptions
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
            <div className="mx-auto grid max-w-md grid-cols-5 items-end rounded-[1.75rem] border border-border/60 bg-card/95 px-2 py-2 shadow-lg backdrop-blur">
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
