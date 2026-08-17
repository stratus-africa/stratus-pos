import { LogOut, Shield, Store } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscription } from "@/hooks/useSubscription";
import { NavLink } from "@/components/NavLink";
import { useLocation, Link } from "@/lib/router-compat";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { APP_MODULES, moduleCategoryLabels, resolveModuleAccess } from "@/lib/modules";

const categoryOrder = ["dashboard", "operations", "finance", "people", "compliance", "tools", "settings"] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const { business, userRole } = useBusiness();
  const { isSuperAdmin } = useSuperAdmin();
  const { hasPermission, permissions } = usePermissions();
  const { hasFeatureKey, enabledFeatureKeys } = useSubscription();
  const currentPath = location.pathname;

  const visibleModules = APP_MODULES.filter((module) => {
    const access = resolveModuleAccess(module.key, {
      role: userRole,
      permissions,
      featureKey: hasFeatureKey,
      moduleEnabled: () => true,
      dependenciesReady: () => true,
      setupComplete: () => true,
      subscriptions: enabledFeatureKeys,
    });
    return access.allowed;
  });

  const renderModule = (module: (typeof APP_MODULES)[number]) => {
    const navItems = module.navigation.filter((item) => !item.permission || hasPermission(item.permission));
    const targetRoute = module.route ?? navItems[0]?.route ?? "/";
    const visibleChildren = navItems.filter((item) => item.route !== targetRoute && item.route !== currentPath);
    const hasChildren = visibleChildren.length > 0;
    const parentActive = currentPath === targetRoute || visibleChildren.some((item) => currentPath === item.route);

    const SidebarIcon = module.Icon;

    if (!hasChildren) {
      return (
        <SidebarMenuItem key={module.key}>
          <SidebarMenuButton asChild isActive={currentPath === targetRoute}>
            <NavLink
              to={targetRoute}
              end
              className="hover:bg-sidebar-accent/50"
              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
            >
              <SidebarIcon className="mr-2 h-4 w-4" />
              {!collapsed && <span>{module.label}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <Collapsible key={module.key} defaultOpen={parentActive} className="group/collapsible">
        <SidebarMenuItem>
          <div className="flex items-center w-full">
            <SidebarMenuButton asChild isActive={currentPath === targetRoute} className="flex-1">
              <NavLink
                to={targetRoute}
                end
                className="hover:bg-sidebar-accent/50"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              >
                <SidebarIcon className="mr-2 h-4 w-4" />
                {!collapsed && <span className="flex-1">{module.label}</span>}
              </NavLink>
            </SidebarMenuButton>
            {!collapsed && (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label={`Toggle ${module.label} submenu`}
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
                {visibleChildren.map((child) => (
                  <SidebarMenuSubItem key={`${module.key}-${child.key}`}>
                    <SidebarMenuSubButton asChild isActive={currentPath === child.route}>
                      <NavLink to={child.route} end className="hover:bg-sidebar-accent/50">
                        <span>{child.label}</span>
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          )}
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  const groupedModules = categoryOrder
    .map((category) => ({
      category,
      modules: visibleModules.filter((module) => module.category === category),
    }))
    .filter((group) => group.modules.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-2 sm:px-3 h-14 min-h-14 max-h-14 flex items-center shrink-0 overflow-hidden">
        <div className="flex items-center gap-2.5 w-full min-w-0 flex-nowrap">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Store className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="text-base font-bold tracking-tight text-sidebar-foreground truncate">StratusPOS</span>
              {business && <span className="text-xs text-muted-foreground truncate">{business.name}</span>}
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groupedModules.map((group) => (
          <SidebarGroup key={group.category}>
            <SidebarGroupLabel>
              {group.category === "dashboard" ? "Dashboard" : moduleCategoryLabels[group.category]}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{group.modules.map(renderModule)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
            <Badge
              variant="outline"
              className="text-xs capitalize w-full justify-center bg-white rounded-sm border-sidebar-border hover:bg-white/90"
            >
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
