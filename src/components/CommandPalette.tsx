import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Store, Users, Package, CreditCard, BookOpen, Headset } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useBusiness } from "@/contexts/BusinessContext";
import { APP_MODULES } from "@/lib/modules";
import { useEntitlement } from "@/hooks/useEntitlement";

type NavEntry = {
  label: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  group: "Navigate" | "Admin";
  keywords?: string;
};

const SUPER_ADMIN_ENTRIES: NavEntry[] = [
  { label: "Super Admin Dashboard", url: "/super-admin", icon: Store, group: "Admin" },
  { label: "Tenant Approvals", url: "/super-admin/tenant-approvals", icon: Users, group: "Admin" },
  { label: "Subscriptions", url: "/super-admin/subscriptions", icon: CreditCard, group: "Admin" },
  { label: "Packages", url: "/super-admin/packages", icon: Package, group: "Admin" },
  {
    label: "Support / Impersonation",
    url: "/super-admin/support",
    icon: Headset,
    group: "Admin",
    keywords: "login as tenant admin support mode impersonation",
  },
  { label: "Landing CMS", url: "/super-admin/landing", icon: BookOpen, group: "Admin" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const { isSuperAdmin } = useSuperAdmin();
  const { userRole } = useBusiness();
  const { hasModule, isLoading: entitlementLoading } = useEntitlement();

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

  const nav = entitlementLoading
    ? []
    : APP_MODULES.filter((module) => {
        if (!module.route || !hasModule(module.key)) return false;
        if (module.roles?.length && (!userRole || !module.roles.includes(userRole as any))) return false;
        return module.permissions.length === 0 || module.permissions.some((permission) => hasPermission(permission));
      }).map((module) => ({
        label: module.label,
        url: module.route!,
        icon: module.Icon,
        group: "Navigate" as const,
        keywords: `${module.label} ${module.description}`,
        permission: module.permissions[0],
      }));

  const admin = isSuperAdmin ? SUPER_ADMIN_ENTRIES : [];

  const go = (url: string) => {
    setOpen(false);
    setQuery("");
    navigate(url);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={`Search pages and actions… (${userRole ?? "user"})`}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {nav.length > 0 && (
          <CommandGroup heading="Navigate">
            {nav.map((e) => (
              <CommandItem
                key={"n:" + e.url + e.label}
                value={`${e.label} ${e.keywords ?? ""}`}
                onSelect={() => go(e.url)}
              >
                <e.icon className="mr-2 h-4 w-4" />
                {e.label}
              </CommandItem>
            ))}
          </CommandGroup>
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
