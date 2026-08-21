import type { ElementType } from "react";
import {
  LayoutDashboard,
  Store,
  Package,
  Boxes,
  Receipt,
  ShoppingBag,
  Wallet,
  BarChart3,
  Calculator,
  BookOpen,
  ShoppingCart,
  Briefcase,
  ArrowLeftRight,
  Wrench,
  Sparkles,
  FileCheck,
  ChefHat,
  Users,
  Truck,
  Settings,
  UserCircle,
} from "lucide-react";

export type ModuleState = "available" | "enabled" | "disabled" | "locked" | "coming_soon" | "setup_required";
export type ModuleGroup = "core" | "accounting" | "premium";
export type ModuleCategory = "dashboard" | "operations" | "finance" | "people" | "compliance" | "tools" | "settings";

export interface ModuleNavigationItem {
  key: string;
  label: string;
  route: string;
  permission?: string;
  section?: string;
}

export interface AppModule {
  key: string;
  label: string;
  description: string;
  category: ModuleCategory;
  group: ModuleGroup;
  Icon: ElementType;
  route?: string;
  status: ModuleState;
  permissions: string[];
  navigation: ModuleNavigationItem[];
  dependencies: string[];
  subscriptionFeature?: string;
  setupRequirements: string[];
  aliases?: string[];
  roles?: string[];
}

export const MODULE_REGISTRY: AppModule[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Business overview & KPIs",
    category: "dashboard",
    group: "core",
    Icon: LayoutDashboard,
    route: "/",
    status: "enabled",
    permissions: ["dashboard.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/" }],
    dependencies: [],
    subscriptionFeature: "dashboard",
    setupRequirements: [],
    roles: ["admin", "manager", "cashier", "stores_manager"],
  },
  {
    key: "pos",
    label: "Point of Sale",
    description: "In-store POS terminal",
    category: "operations",
    group: "core",
    Icon: Store,
    route: "/pos",
    status: "enabled",
    permissions: ["pos.view"],
    navigation: [
      { key: "overview", label: "Overview", route: "/pos" },
      { key: "transactions", label: "Transactions", route: "/pos", permission: "pos.view" },
    ],
    dependencies: [],
    subscriptionFeature: "pos",
    setupRequirements: [],
    roles: ["admin", "manager", "cashier"],
  },
  {
    key: "products",
    label: "Products",
    description: "Product catalog management",
    category: "operations",
    group: "core",
    Icon: Package,
    route: "/products",
    status: "enabled",
    permissions: ["products.view", "products.create", "products.edit"],
    navigation: [
      { key: "overview", label: "Overview", route: "/products" },
      { key: "barcode-mapping", label: "Barcode Mapping", route: "/barcode-mapping", permission: "products.edit" },
    ],
    dependencies: [],
    subscriptionFeature: "products",
    setupRequirements: [],
    roles: ["admin", "manager", "cashier", "stores_manager"],
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Stock levels, adjustments and transfers",
    category: "operations",
    group: "core",
    Icon: Boxes,
    route: "/inventory",
    status: "enabled",
    permissions: [
      "inventory.view",
      "inventory.create",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.cost.view",
    ],
    navigation: [
      { key: "overview", label: "Overview", route: "/inventory" },
      { key: "stock", label: "Stock Levels", route: "/inventory", permission: "inventory.view" },
      { key: "adjustments", label: "Stock Adjustments", route: "/inventory", permission: "inventory.adjust" },
      { key: "transfers", label: "Stock Transfers", route: "/inventory", permission: "inventory.transfer" },
    ],
    dependencies: ["products"],
    subscriptionFeature: "inventory",
    setupRequirements: [],
    roles: ["admin", "manager", "stores_manager"],
  },
  {
    key: "sales",
    label: "Sales",
    description: "Sales records, invoices and customers",
    category: "operations",
    group: "core",
    Icon: Receipt,
    route: "/sales",
    status: "enabled",
    permissions: ["sales.view", "sales.create", "sales.edit"],
    navigation: [
      { key: "overview", label: "Overview", route: "/sales" },
      { key: "transactions", label: "Transactions", route: "/sales" },
      { key: "customers", label: "Customers", route: "/customers", permission: "customers.view" },
    ],
    dependencies: ["products"],
    subscriptionFeature: "sales",
    setupRequirements: [],
    roles: ["admin", "manager", "cashier"],
  },
  {
    key: "purchases",
    label: "Purchases",
    description: "Supplier bills and purchase orders",
    category: "operations",
    group: "core",
    Icon: ShoppingBag,
    route: "/purchases",
    status: "enabled",
    permissions: ["purchases.view", "purchases.create", "purchases.edit"],
    navigation: [
      { key: "overview", label: "Overview", route: "/purchases" },
      { key: "new", label: "New Purchase", route: "/purchases/new", permission: "purchases.create" },
      { key: "suppliers", label: "Suppliers", route: "/suppliers", permission: "suppliers.view" },
    ],
    dependencies: ["products"],
    subscriptionFeature: "purchases",
    setupRequirements: [],
    roles: ["admin", "manager", "stores_manager"],
  },
  {
    key: "expenses",
    label: "Expenses",
    description: "Track and categorize business expenses",
    category: "operations",
    group: "core",
    Icon: Wallet,
    route: "/expenses",
    status: "enabled",
    permissions: ["expenses.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/expenses" }],
    dependencies: [],
    subscriptionFeature: "expenses",
    setupRequirements: [],
    roles: ["admin", "manager", "cashier", "stores_manager"],
  },
  {
    key: "customers",
    label: "Customers",
    description: "Customer records and relationship management",
    category: "people",
    group: "core",
    Icon: Users,
    route: "/customers",
    status: "enabled",
    permissions: ["customers.view", "customers.create", "customers.edit"],
    navigation: [{ key: "overview", label: "Overview", route: "/customers" }],
    dependencies: ["sales"],
    subscriptionFeature: "customers",
    setupRequirements: [],
    roles: ["admin", "manager", "cashier"],
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Supplier directory and purchase stakeholders",
    category: "people",
    group: "core",
    Icon: Truck,
    route: "/suppliers",
    status: "enabled",
    permissions: ["suppliers.view", "suppliers.create", "suppliers.edit"],
    navigation: [{ key: "overview", label: "Overview", route: "/suppliers" }],
    dependencies: ["purchases"],
    subscriptionFeature: "purchases",
    setupRequirements: [],
    roles: ["admin", "manager", "stores_manager"],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Sales, inventory and financial reporting",
    category: "finance",
    group: "core",
    Icon: BarChart3,
    route: "/reports",
    status: "enabled",
    permissions: ["report.sales", "report.purchases", "report.expenses", "report.inventory", "report.pnl"],
    navigation: [{ key: "overview", label: "Overview", route: "/reports" }],
    dependencies: [],
    subscriptionFeature: "reports",
    setupRequirements: [],
    roles: ["admin", "manager", "cashier", "stores_manager"],
  },
  {
    key: "manual_journals",
    label: "Manual Journals",
    description: "Manual journal creation, approval and posting",
    category: "finance",
    group: "accounting",
    Icon: BookOpen,
    route: "/journal-entries",
    status: "enabled",
    permissions: [
      "manual_journals.view",
      "manual_journals.create",
      "manual_journals.edit",
      "manual_journals.delete",
      "manual_journals.submit",
      "manual_journals.approve",
      "manual_journals.post",
      "manual_journals.reverse",
      "manual_journals.view_posted",
      "manual_journals.export",
    ],
    navigation: [
      { key: "overview", label: "Journal Entries", route: "/journal-entries", permission: "manual_journals.view" },
    ],
    dependencies: ["accounting"],
    subscriptionFeature: "manual_journals",
    setupRequirements: ["chart_of_accounts", "fiscal_year"],
    aliases: ["manual_journal", "journal_entries"],
    roles: ["admin", "manager"],
  },
  {
    key: "accounting",
    label: "Accounting",
    description: "Unified accounting module for accounts, journals and reports",
    category: "finance",
    group: "accounting",
    Icon: Calculator,
    route: "/chart-of-accounts",
    status: "enabled",
    permissions: [
      "accounting.view",
      "chart_of_accounts.view",
      "accounting.journal.create",
      "accounting.reconciliation",
      "accounting.reports",
    ],
    navigation: [
      { key: "overview", label: "Overview", route: "/chart-of-accounts", permission: "chart_of_accounts.view" },
      {
        key: "chart-of-accounts",
        label: "Chart of Accounts",
        route: "/chart-of-accounts",
        permission: "chart_of_accounts.view",
      },
      {
        key: "journal-entries",
        label: "Journal Entries",
        route: "/journal-entries",
        permission: "chart_of_accounts.view",
      },
      { key: "banking", label: "Banking / Bank Accounts", route: "/banking", permission: "banking.view" },
      { key: "reports", label: "Financial Reports", route: "/reports", permission: "accounting.reports" },
    ],
    dependencies: ["sales", "purchases", "expenses"],
    subscriptionFeature: "accounting",
    setupRequirements: ["chart_of_accounts", "fiscal_year"],
    aliases: ["chart_of_accounts", "manual_journals", "journal_entries"],
    roles: ["admin", "manager"],
  },
  {
    key: "banking",
    label: "Banking",
    description: "Bank accounts and reconciliation flows",
    category: "finance",
    group: "accounting",
    Icon: Wallet,
    route: "/banking",
    status: "enabled",
    permissions: ["banking.view", "banking.create", "banking.edit"],
    navigation: [{ key: "overview", label: "Overview", route: "/banking" }],
    dependencies: ["accounting"],
    subscriptionFeature: "banking",
    setupRequirements: [],
    roles: ["admin", "manager"],
  },
  {
    key: "hr",
    label: "Human Resources & Payroll",
    description: "Employees, leave and payroll",
    category: "people",
    group: "premium",
    Icon: Briefcase,
    route: "/hr",
    status: "locked",
    permissions: ["hr.view", "hr.create", "hr.edit"],
    navigation: [{ key: "overview", label: "Overview", route: "/hr" }],
    dependencies: [],
    subscriptionFeature: "hr",
    setupRequirements: [],
    aliases: ["human_resources", "human_resources_payroll", "hr_management", "payroll"],
    roles: ["admin", "manager"],
  },
  {
    key: "digitax",
    label: "Tax / eTIMS",
    description: "Kenya KRA eTIMS compliance and filing",
    category: "compliance",
    group: "premium",
    Icon: FileCheck,
    route: "/tax-compliance",
    status: "setup_required",
    permissions: ["settings.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/tax-compliance" }],
    dependencies: ["accounting"],
    subscriptionFeature: "digitax",
    setupRequirements: ["tax_settings"],
    aliases: ["etims", "kra_etims"],
    roles: ["admin", "manager"],
  },
  {
    key: "service_maintenance",
    label: "Service & Maintenance",
    description: "Service jobs, repairs and maintenance schedules",
    category: "tools",
    group: "premium",
    Icon: Wrench,
    status: "coming_soon",
    permissions: ["service_maintenance.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/service-maintenance" }],
    dependencies: [],
    subscriptionFeature: "service_maintenance",
    setupRequirements: [],
    roles: ["admin", "manager"],
  },
  {
    key: "online_orders",
    label: "Online Orders",
    description: "E-commerce and online order management",
    category: "tools",
    group: "premium",
    Icon: ShoppingCart,
    route: "/online-orders",
    status: "coming_soon",
    permissions: ["online_orders.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/online-orders" }],
    dependencies: ["products", "inventory", "sales"],
    subscriptionFeature: "online_orders",
    setupRequirements: [],
    aliases: ["woocommerce"],
    roles: ["admin", "manager"],
  },
  {
    key: "bakery",
    label: "Bakery Production",
    description: "Recipes, batch production and ingredient costing",
    category: "tools",
    group: "premium",
    Icon: ChefHat,
    route: "/bakery",
    status: "locked",
    permissions: ["bakery.view", "bakery.create", "bakery.edit"],
    navigation: [{ key: "overview", label: "Overview", route: "/bakery" }],
    dependencies: ["products", "inventory", "purchases"],
    subscriptionFeature: "bakery",
    setupRequirements: [],
    aliases: ["bakery_production"],
    roles: ["admin", "manager", "stores_manager"],
  },
  {
    key: "settings",
    label: "Business Settings",
    description: "Business profile and configuration",
    category: "settings",
    group: "core",
    Icon: Settings,
    route: "/settings",
    status: "enabled",
    permissions: ["settings.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/settings" }],
    dependencies: [],
    setupRequirements: [],
    roles: ["admin"],
  },
  {
    key: "profile",
    label: "My Profile",
    description: "User preferences and workspace profile",
    category: "settings",
    group: "core",
    Icon: UserCircle,
    route: "/profile",
    status: "enabled",
    permissions: [],
    navigation: [{ key: "overview", label: "Overview", route: "/profile" }],
    dependencies: [],
    setupRequirements: [],
    roles: ["admin", "manager", "cashier", "stores_manager"],
  },
  {
    key: "ai_reports",
    label: "AI Insights",
    description: "AI-powered analytics and recommendations",
    category: "tools",
    group: "premium",
    Icon: Sparkles,
    status: "coming_soon",
    permissions: ["ai_reports.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/ai-insights" }],
    dependencies: ["reports"],
    subscriptionFeature: "ai_reports",
    setupRequirements: [],
    roles: ["admin", "manager"],
  },
  {
    key: "multi_location",
    label: "Multi-Location",
    description: "Operate more than one store or branch",
    category: "operations",
    group: "premium",
    Icon: Store,
    status: "available",
    permissions: ["locations.view"],
    navigation: [{ key: "overview", label: "Overview", route: "/locations" }],
    dependencies: [],
    subscriptionFeature: "multi_location",
    setupRequirements: [],
    roles: ["admin", "manager"],
  },
];

export const APP_MODULES: AppModule[] = MODULE_REGISTRY;

export function getCanonicalFeatureKey(featureKey: string | null | undefined): string {
  if (!featureKey) return "";

  const module = findModule(featureKey);
  if (module) return module.key;

  const normalized = featureKey.trim().toLowerCase();
  const dottedPrefix = normalized.split(".")[0]?.trim();
  if (dottedPrefix) return dottedPrefix;

  return normalized;
}

export function getEnabledCanonicalModules(
  features: Array<{ package_id?: string; feature_key?: string; enabled?: boolean }>,
  packageId?: string,
): string[] {
  const enabled = new Set<string>();
  for (const feature of features) {
    if (packageId && feature.package_id && feature.package_id !== packageId) continue;
    if (!feature.enabled || !feature.feature_key) continue;
    const canonical = getCanonicalFeatureKey(feature.feature_key);
    if (canonical) enabled.add(canonical);
  }

  return APP_MODULES.filter((module) => enabled.has(module.key)).map((module) => module.key);
}

export function applyModuleToggleDependencyRule(
  moduleKey: string,
  enabled: boolean,
  currentState: Record<string, boolean>,
): { next: Record<string, boolean>; blocked: boolean; reason?: string } {
  const canonicalKey = getCanonicalFeatureKey(moduleKey);
  const normalizedState: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(currentState)) {
    normalizedState[getCanonicalFeatureKey(key)] = Boolean(value);
  }

  const nextState = { ...normalizedState };

  if (canonicalKey === "accounting" && !enabled && (nextState.banking || nextState.manual_journals)) {
    return {
      next: nextState,
      blocked: true,
      reason: "Accounting must stay enabled while Banking or Manual Journals is active.",
    };
  }

  if ((canonicalKey === "banking" || canonicalKey === "manual_journals") && enabled) {
    nextState.accounting = true;
  }

  return { next: nextState, blocked: false };
}

export const moduleGroupLabels: Record<ModuleGroup, string> = {
  core: "Core modules",
  accounting: "Accounting suite",
  premium: "Premium modules",
};

export const moduleCategoryLabels: Record<ModuleCategory, string> = {
  dashboard: "Dashboard",
  operations: "Operations",
  finance: "Finance",
  people: "People",
  compliance: "Compliance",
  tools: "Tools",
  settings: "Settings",
};

export const normalizeModuleKey = (key: string | null | undefined): string => {
  return (key ?? "").trim().toLowerCase().replace(/\s+/g, "_");
};

export const findModule = (key: string | null | undefined) => {
  if (!key) return undefined;

  const normalized = normalizeModuleKey(key);
  const prefix = normalized.split(".")[0];
  const candidates = new Set<string>();
  candidates.add(normalized);
  if (prefix) candidates.add(prefix);
  if (normalized.includes(".")) candidates.add(normalized.replace(/\./g, "_"));

  return MODULE_REGISTRY.find((module) => {
    const aliases = [module.key, ...(module.aliases ?? [])].map((alias) => normalizeModuleKey(alias));
    return [...candidates].some((candidate) => {
      return aliases.includes(candidate) || aliases.some((alias) => candidate.startsWith(`${alias}.`));
    });
  });
};

export const moduleKeys = (key: string): string[] => {
  const normalized = normalizeModuleKey(key);
  const m = findModule(key);
  if (!m) {
    const prefix = normalized.split(".")[0];
    return Array.from(new Set([normalized, prefix, getCanonicalFeatureKey(key)].filter(Boolean)));
  }

  const aliases = [m.key, ...(m.aliases ?? [])].map((alias) => normalizeModuleKey(alias));
  const base = normalized.split(".")[0];
  return Array.from(new Set([m.key, ...aliases, normalized, base, getCanonicalFeatureKey(key)].filter(Boolean)));
};

export type ModuleAccessInput = {
  role?: string | null;
  permissions?: Set<string> | string[];
  subscriptions?: Set<string> | string[];
  featureKey?: (key: string) => boolean;
  moduleEnabled?: (key: string) => boolean;
  dependenciesReady?: (key: string) => boolean;
  setupComplete?: (key: string) => boolean;
};

export function resolveModuleAccess(moduleKey: string, input: ModuleAccessInput = {}) {
  const module = findModule(moduleKey) ?? findModule(moduleKey.toLowerCase());

  if (!module) {
    return { allowed: false, state: "disabled" as ModuleState, module: null, reason: "module_not_found" };
  }

  const subscriptions = new Set(
    Array.isArray(input.subscriptions) ? input.subscriptions : input.subscriptions ? [...input.subscriptions] : [],
  );
  const permissions = new Set(
    Array.isArray(input.permissions) ? input.permissions : input.permissions ? [...input.permissions] : [],
  );
  const role = input.role?.toLowerCase();
  const featureKey = input.featureKey ?? (() => false);
  const moduleEnabled = input.moduleEnabled ?? (() => true);
  const dependenciesReady = input.dependenciesReady ?? (() => true);
  const setupComplete = input.setupComplete ?? (() => true);

  const matchSubscription =
    subscriptions.has(module.key) ||
    (module.subscriptionFeature ? subscriptions.has(module.subscriptionFeature) : false) ||
    (module.subscriptionFeature ? featureKey(module.subscriptionFeature) : featureKey(module.key));

  if (module.status === "coming_soon") {
    return { allowed: false, state: "coming_soon" as ModuleState, module, reason: "coming_soon" };
  }

  if (!matchSubscription) {
    return { allowed: false, state: "locked" as ModuleState, module, reason: "subscription_required" };
  }

  if (!moduleEnabled(module.key)) {
    return { allowed: false, state: "disabled" as ModuleState, module, reason: "module_disabled" };
  }

  if (role && module.roles && !module.roles.includes(role)) {
    return { allowed: false, state: "locked" as ModuleState, module, reason: "role_access" };
  }

  if (module.dependencies.length > 0 && !module.dependencies.every((dependency) => dependenciesReady(dependency))) {
    return { allowed: false, state: "disabled" as ModuleState, module, reason: "dependency_missing" };
  }

  if (
    module.setupRequirements.length > 0 &&
    !module.setupRequirements.every((requirement) => setupComplete(requirement))
  ) {
    return { allowed: false, state: "setup_required" as ModuleState, module, reason: "setup_required" };
  }

  const requiredPermissions = module.permissions.length > 0 ? module.permissions : [];
  const hasRequiredPermissions =
    requiredPermissions.length === 0 || requiredPermissions.some((permission) => permissions.has(permission));
  if (!hasRequiredPermissions) {
    return { allowed: false, state: "disabled" as ModuleState, module, reason: "permission_missing" };
  }

  return { allowed: true, state: module.status === "enabled" ? "enabled" : module.status, module, reason: "ok" };
}

export function getVisibleModules(moduleKeysList: Array<string>, input: ModuleAccessInput = {}): string[] {
  return moduleKeysList.filter((key) => resolveModuleAccess(key, input).allowed);
}

export function getModuleRouteAccess(moduleKey: string, route?: string, input: ModuleAccessInput = {}) {
  const module = findModule(moduleKey) ?? findModule(moduleKey.toLowerCase());
  const baseAccess = resolveModuleAccess(moduleKey, input);

  if (!module) {
    return { ...baseAccess, route: route ?? null, sectionKey: null };
  }

  const normalizedRoute = (route ?? module.route ?? "").split("?")[0].split("#")[0].trim();

  const navMatch = module.navigation.find((item) => {
    const candidate = item.route.split("?")[0].split("#")[0].trim();
    return candidate === normalizedRoute || normalizedRoute.startsWith(`${candidate}/`);
  });

  const routeMatches =
    !normalizedRoute ||
    normalizedRoute === module.route ||
    (navMatch && navMatch.route === normalizedRoute) ||
    module.navigation.some((item) => {
      const candidate = item.route.split("?")[0].split("#")[0].trim();
      return candidate === normalizedRoute || normalizedRoute.startsWith(`${candidate}/`);
    });

  return {
    ...baseAccess,
    allowed: baseAccess.allowed && routeMatches,
    route: normalizedRoute || module.route || null,
    sectionKey: navMatch?.key ?? (normalizedRoute === module.route ? "overview" : null),
  };
}

export const APP_MODULES_BY_KEY = Object.fromEntries(MODULE_REGISTRY.map((module) => [module.key, module]));
export const APP_MODULES_BY_ROUTE = Object.fromEntries(
  MODULE_REGISTRY.filter((module) => module.route).map((module) => [module.route, module]),
);
