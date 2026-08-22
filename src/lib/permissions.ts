// Shared permission catalog & defaults. Used by both the Roles & Permissions
// editor and the runtime usePermissions hook so the UI and access checks stay
// in sync.

import { FEATURE_KEYS } from "@/lib/featureCatalog";

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
  { key: "stock_take", label: "Stock Take (Counts)", actions: ["view", "create", "edit", "delete"] },
  { key: "bakery", label: "Bakery Production", actions: ["view", "create", "edit", "delete"] },

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
  { key: "hr", label: "Human Resources & Payroll", actions: ["view", "create", "edit", "delete"] },
];

export const reportsCatalog = [
  { key: "report.sales", label: "Sales Report" },
  { key: "report.purchases", label: "Purchases Report" },
  { key: "report.expenses", label: "Expenses Report" },
  { key: "report.inventory", label: "Inventory Report" },
  { key: "report.pnl", label: "Profit & Loss Report" },
  { key: "report.stock_movement", label: "Stock Movement Report" },
  { key: "report.audit", label: "Audit Trail Report" },
];

/** Marker row written by the Roles editor so saved configs are treated as authoritative. */
export const CONFIGURED_MARKER = "__configured__";

export const permKey = (moduleKey: string, action: string) => `${moduleKey}.${action}`;
export const allModulePerms = moduleCatalog.flatMap((m) => m.actions.map((a) => permKey(m.key, a)));
export const allReportPerms = reportsCatalog.map((r) => r.key);
export const allPermissionKeys = Array.from(new Set([...allModulePerms, ...allReportPerms, ...FEATURE_KEYS]));

/** Keeps module permissions in the required view/create/edit/delete order. */
export function normalizePermissions(permissions: Iterable<string>): string[] {
  const normalized = new Set(permissions);

  for (const mod of moduleCatalog) {
    const actions = new Set(mod.actions);
    const has = (action: ModuleAction) => actions.has(action) && normalized.has(permKey(mod.key, action));
    const add = (action: ModuleAction) => {
      if (actions.has(action)) normalized.add(permKey(mod.key, action));
    };

    if (has("create")) add("view");
    if (has("edit")) {
      add("view");
      add("create");
    }
    if (has("delete")) {
      add("view");
      add("create");
      add("edit");
    }
  }

  return Array.from(normalized);
}

export const defaultRolePermissions: Record<AppRole, string[]> = {
  admin: [...allPermissionKeys],
  manager: [
    "dashboard.view",
    // POS feature-level defaults: managers can operate and supervise the full terminal.
    "pos.view",
    "pos.create",
    "pos.create_sale",
    "pos.hold_sale",
    "pos.resume_sale",
    "pos.edit_cart",
    "pos.apply_discount",
    "pos.apply_line_discount",
    "pos.change_price",
    "pos.void_sale",
    "pos.delete_cart",
    "pos.suspend",
    "pos.reprint_receipt",
    "pos.payment_cash",
    "pos.payment_mobile_money",
    "pos.payment_card",
    "pos.payment_bank",
    "pos.payment_credit",
    "pos.split_payment",
    "pos.change_payment_method",
    "pos.refund",
    "pos.open_till",
    "pos.close_till",
    "pos.view_till",
    "pos.cash_in",
    "pos.cash_out",
    "pos.reconcile_till",
    "pos.override",
    "pos.select_customer",
    "pos.create_customer",
    "pos.credit_sale",
    "products.view",
    "products.edit",
    "inventory.view",
    "inventory.edit",
    "stock_take.view",
    "stock_take.create",
    "stock_take.edit",
    "stock_take.delete",
    "bakery.view",
    "bakery.create",
    "bakery.edit",
    "sales.view",
    "sales.create",
    "sales.edit",
    "customers.view",
    "customers.create",
    "customers.edit",
    "purchases.view",
    "purchases.create",
    "purchases.edit",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "hr.view",
    "hr.create",
    "hr.edit",
    "report.sales",
    "report.purchases",
    "report.inventory",
    "report.stock_movement",
  ],
  cashier: [
    "pos.view",
    "pos.create",
    "pos.create_sale",
    "pos.hold_sale",
    "pos.resume_sale",
    "pos.edit_cart",
    "pos.delete_cart",
    "pos.suspend",
    "pos.reprint_receipt",
    "pos.payment_cash",
    "pos.payment_mobile_money",
    "pos.payment_card",
    "pos.split_payment",
    "pos.change_payment_method",
    "pos.open_till",
    "pos.view_till",
    "pos.select_customer",
    "pos.create_customer",
    "sales.view",
    "customers.view",
    "customers.create",
    "hr.view",
  ],
  stores_manager: [
    "dashboard.view",
    "products.view",
    "products.create",
    "products.edit",
    "inventory.view",
    "inventory.create",
    "inventory.edit",
    "stock_take.view",
    "stock_take.create",
    "stock_take.edit",
    "bakery.view",
    "bakery.create",
    "bakery.edit",
    "purchases.view",
    "purchases.create",
    "purchases.edit",
    "suppliers.view",
    "suppliers.create",
    "suppliers.edit",
    "report.inventory",
    "report.purchases",
    "report.stock_movement",
  ],
};

export const roleDescriptions: Record<AppRole, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Full access to all features and settings." },
  manager: { label: "Manager", description: "Day-to-day operations management." },
  cashier: { label: "Cashier", description: "POS-only access for processing sales." },
  stores_manager: { label: "Stores Manager", description: "Manages stock, purchases and inventory operations." },
};

/**
 * Permissions a Cashier can never hold, regardless of what is stored in
 * role_permissions. Cashiers are POS-only and must not reach accounting
 * surfaces or the stock movement ledger.
 */
export const cashierDeniedPermissions: string[] = [
  "chart_of_accounts.view",
  "chart_of_accounts.create",
  "chart_of_accounts.edit",
  "chart_of_accounts.delete",
  "banking.view",
  "banking.create",
  "banking.edit",
  "banking.delete",
  "settings.view",
  "settings.edit",
  "report.pnl",
  "report.stock_movement",
];
