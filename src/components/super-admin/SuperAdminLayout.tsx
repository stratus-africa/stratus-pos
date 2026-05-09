import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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
  LayoutTemplate,
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
  Zap,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

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
      { title: "Plans", url: "/super-admin/packages", icon: Tag },
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
      { title: "Landing Page", url: "/super-admin/landing", icon: Globe },
      { title: "Landing layouts", url: "/super-admin/landing-layouts", icon: LayoutTemplate },
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
    ],
  },
];

export function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarVisible = !isMobile || mobileOpen;
  const userName = (user?.user_metadata as any)?.full_name || "Super Admin";

  const isActive = (url: string) => {
    if (url === "/super-admin") return location.pathname === "/super-admin";
    return location.pathname.startsWith(url);
  };

  return (
    <div className="flex min-h-screen bg-[hsl(210_20%_98%)]">
      {/* Backdrop on mobile */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {sidebarVisible && (
        <aside
          className={cn(
            "bg-white border-r border-border flex flex-col transition-[width] duration-200",
            isMobile ? "fixed inset-y-0 left-0 z-40 w-64" : "w-64"
          )}
        >
          {/* Brand */}
          <div className="px-5 py-5 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight">StratusPOS</span>
          </div>

          {/* Nav groups */}
          <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.url);
                    return (
                      <Link
                        key={item.url}
                        to={item.url}
                        onClick={() => isMobile && setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                          active
                            ? "bg-emerald-50 text-emerald-700 font-medium"
                            : "text-foreground/70 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0", active && "text-emerald-600")} />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-3 border-t border-border">
            <Button
              variant="outline"
              className="w-full justify-center gap-2 text-sm"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => (isMobile ? setMobileOpen((o) => !o) : setCollapsed((c) => !c))}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <button className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-foreground/70 hover:bg-muted">
              <span className="text-base leading-none">🇬🇧</span>
              EN
            </button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-foreground/60">
              <Zap className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-foreground/60 border border-border">
              <Bell className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 pl-2 ml-1">
              <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-semibold">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:block text-sm font-medium">{userName}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
