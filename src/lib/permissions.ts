// Shared permission catalog & defaults. Used by both the Roles & Permissions
// editor and the runtime usePermissions hook so the UI and access checks stay
// in sync.

export type AppRole = "admin" | "manager" | "cashier" | "stores_manager";

export type ModuleAction = "view" | "create" | "edit" | "delete";

export interface ModuleDef {
  key: string;
  label: string;
  actions: ModuleAction[];
}

export const moduleCatalog: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard & Analytics", actions: ["view"] },
  { key: "pos", label: "Point of Sale (POS)", actions: ["view", "create"] },
  { key: "products", label: "Products", actions: ["view", "create", "edit", "delete"] },
  { key: "inventory", label: "Inventory", actions: ["view", "create", "edit", "delete"] },
  { key: "sales", label: "Sales", actions: ["view", "create", "edit", "delete"] },
  { key: "customers", label: "Customers", actions: ["view", "create", "edit", "delete"] },
  { key: "purchases", label: "Purchases", actions: ["view", "create", "edit", "delete"] },
  { key: "suppliers", label: "Suppliers", actions: ["view", "create", "edit", "delete"] },
  { key: "expenses", label: "Expenses", actions: ["view", "create", "edit", "delete"] },
  { key: "banking", label: "Banking & Reconciliation", actions: ["view", "create", "edit", "delete"] },
  { key: "chart_of_accounts", label: "Chart of Accounts", actions: ["view", "create", "edit", "delete"] },
  { key: "settings", label: "Settings & Business Profile", actions: ["view", "edit"] },
  { key: "users", label: "User Management", actions: ["view", "create", "edit", "delete"] },
  { key: "roles", label: "Roles Management", actions: ["view", "edit"] },
];

export const reportsCatalog = [
  { key: "report.sales", label: "Sales Report" },
  { key: "report.purchases", label: "Purchases Report" },
  { key: "report.expenses", label: "Expenses Report" },
  { key: "report.inventory", label: "Inventory Report" },
  { key: "report.pnl", label: "Profit & Loss Report" },
  { key: "report.audit", label: "Audit Trail Report" },
];

export const permKey = (moduleKey: string, action: string) => `${moduleKey}.${action}`;
export const allModulePerms = moduleCatalog.flatMap((m) => m.actions.map((a) => permKey(m.key, a)));
export const allReportPerms = reportsCatalog.map((r) => r.key);
export const allPermissionKeys = [...allModulePerms, ...allReportPerms];

export const defaultRolePermissions: Record<AppRole, string[]> = {
  admin: [...allPermissionKeys],
  manager: [
    "dashboard.view",
    "pos.view", "pos.create",
    "products.view", "products.edit",
    "inventory.view", "inventory.edit",
    "sales.view", "sales.create", "sales.edit",
    "customers.view", "customers.create", "customers.edit",
    "purchases.view", "purchases.create", "purchases.edit",
    "suppliers.view", "suppliers.create", "suppliers.edit",
    "report.sales", "report.purchases", "report.inventory",
  ],
  cashier: [
    "pos.view", "pos.create",
    "sales.view",
    "customers.view", "customers.create",
  ],
  stores_manager: [
    "products.view", "products.create", "products.edit",
    "inventory.view", "inventory.create", "inventory.edit",
    "purchases.view", "purchases.create", "purchases.edit",
    "suppliers.view", "suppliers.create", "suppliers.edit",
    "report.inventory", "report.purchases",
  ],
};

export const roleDescriptions: Record<AppRole, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Full access to all features and settings." },
  manager: { label: "Manager", description: "Day-to-day operations management." },
  cashier: { label: "Cashier", description: "POS-only access for processing sales." },
  stores_manager: { label: "Stores Manager", description: "Manages stock, purchases and inventory operations." },
};
