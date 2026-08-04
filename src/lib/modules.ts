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
} from "lucide-react";

export type ModuleGroup = "core" | "accounting" | "premium";

export interface AppModule {
  /** Canonical feature key stored in package_features.feature_key */
  key: string;
  label: string;
  description: string;
  group: ModuleGroup;
  Icon: ElementType;
  /** Alternate keys treated as equivalent (naming drift across older packages) */
  aliases?: string[];
  /** In-app route the module unlocks, when it has a dedicated screen */
  route?: string;
}

/**
 * Single source of truth for the module catalog.
 * Used by the super admin Modules Management screen, the plan editor and the
 * tenant-side feature gates.
 */
export const APP_MODULES: AppModule[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Business overview & KPIs",
    group: "core",
    Icon: LayoutDashboard,
    route: "/",
  },
  {
    key: "pos",
    label: "Point of Sale",
    description: "In-store POS terminal",
    group: "core",
    Icon: Store,
    route: "/pos",
  },
  {
    key: "products",
    label: "Products",
    description: "Product catalog management",
    group: "core",
    Icon: Package,
    route: "/products",
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Stock levels & adjustments",
    group: "core",
    Icon: Boxes,
    route: "/inventory",
  },
  {
    key: "sales",
    label: "Sales",
    description: "Sales records & invoices",
    group: "core",
    Icon: Receipt,
    route: "/sales",
  },
  {
    key: "purchases",
    label: "Purchases",
    description: "Purchase orders & supplier bills",
    group: "core",
    Icon: ShoppingBag,
    route: "/purchases",
  },
  {
    key: "expenses",
    label: "Expenses",
    description: "Track & categorize expenses",
    group: "core",
    Icon: Wallet,
    route: "/expenses",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Sales, P&L, inventory reports",
    group: "core",
    Icon: BarChart3,
    route: "/reports",
  },
  {
    key: "hr",
    label: "Human Resources & Payroll",
    description: "Employees, leave, payroll and payslips",
    group: "premium",
    Icon: Briefcase,
    aliases: ["human_resources", "human_resources_payroll"],
    route: "/hr",
  },

  {
    key: "accounting",
    label: "Accounting",
    description: "Banking, manual journals & accountant tools",
    group: "accounting",
    Icon: Calculator,
    aliases: ["chart_of_accounts"],
    route: "/chart-of-accounts",
  },
  {
    key: "banking",
    label: "Banking",
    description: "Bank accounts & transactions",
    group: "accounting",
    Icon: Wallet,
    route: "/banking",
  },
  {
    key: "manual_journals",
    label: "Manual Journals",
    description: "Post manual journal entries",
    group: "accounting",
    Icon: BookOpen,
    aliases: ["journal_entries"],
    route: "/journal-entries",
  },

  {
    key: "hr_management",
    label: "HR Management",
    description: "Employees, leave, payslips & payroll",
    group: "premium",
    Icon: Briefcase,
    aliases: ["hr", "payroll"],
    route: "/hr",
  },
  {
    key: "digitax",
    label: "DigiTax (KRA eTIMS)",
    description: "Kenya KRA eTIMS fiscalization & VAT compliance",
    group: "premium",
    Icon: FileCheck,
    aliases: ["etims", "kra_etims"],
    route: "/digitax",
  },
  {
    key: "service_maintenance",
    label: "Service & Maintenance",
    description: "Service jobs, repairs & maintenance schedules",
    group: "premium",
    Icon: Wrench,
  },
  {
    key: "online_orders",
    label: "Online Orders",
    description: "E-commerce & online order management",
    group: "premium",
    Icon: ShoppingCart,
    aliases: ["woocommerce"],
  },
  {
    key: "transfers",
    label: "Transfers",
    description: "Stock transfers between locations",
    group: "premium",
    Icon: ArrowLeftRight,
  },
  {
    key: "multi_location",
    label: "Multi-Location",
    description: "Operate more than one store/branch",
    group: "premium",
    Icon: Store,
  },
  {
    key: "ai_reports",
    label: "AI Reports",
    description: "AI-powered analytics & insights",
    group: "premium",
    Icon: Sparkles,
  },
  {
    key: "bakery",
    label: "Bakery Production",
    description: "Recipes, batch production & ingredient costing",
    group: "premium",
    Icon: ChefHat,
    aliases: ["bakery_production"],
    route: "/bakery",
  },
];

export const moduleGroupLabels: Record<ModuleGroup, string> = {
  core: "Core modules",
  accounting: "Accounting suite",
  premium: "Premium modules",
};

export const findModule = (key: string) => APP_MODULES.find((m) => m.key === key || m.aliases?.includes(key));

/** Every accepted key (canonical + aliases) for a module. */
export const moduleKeys = (key: string): string[] => {
  const m = findModule(key);
  return m ? [m.key, ...(m.aliases ?? [])] : [key];
};
