// Entitlement system types - canonical data model
// These types represent the new architecture after migration

export type ModuleStatus = "enabled" | "disabled" | "locked" | "coming_soon" | "setup_required" | "available";
export type ModuleGroup = "core" | "accounting" | "premium";
export type ModuleCategory = "dashboard" | "operations" | "finance" | "people" | "compliance" | "tools" | "settings";

// Canonical module definition (from database)
export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  category: ModuleCategory;
  group: ModuleGroup;
  route?: string;
  status: ModuleStatus;
  icon?: string;
  dependencies: string[]; // Module keys this depends on
  setupRequirements: string[]; // Setup requirements this depends on
  roles?: string[]; // Roles that can access this module
  aliases?: string[]; // Legacy names for backward compatibility
}

// Canonical feature definition (from database - module_features table)
export interface ModuleFeature {
  id: string;
  module_key: string;
  feature_key: string; // Globally unique
  feature_label: string;
  description?: string;
  permission_key: string; // Used in role_permissions
  navigation_key?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Plan entitlement (from database - package_features table)
// Represents which modules are included in a plan
export interface PlanModule {
  id: string;
  package_id: string;
  feature_key: string; // Canonical module key or module feature key (e.g. multi_location.transfer_stock)
  feature_label: string;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

// Subscription plan details
export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  monthly_price_kes: number;
  yearly_price_kes: number;
  max_products: number;
  max_users: number;
  max_locations: number;
  max_customers?: number;
  max_suppliers?: number;
  trial_days: number;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Tenant subscription
export interface TenantSubscription {
  id: string;
  user_id: string;
  status: "active" | "trialing" | "canceled" | "past_due";
  plan_id?: string; // Can be null if subscription exists but plan not resolved
  environment: "sandbox" | "live";
  current_period_start?: string;
  current_period_end?: string;
  created_at: string;
  updated_at: string;
}

// Entitlement result for a module
export interface ModuleEntitlement {
  module_key: string;
  module_label: string;
  entitled: boolean; // Plan includes this module
  reason?: string; // Why denied if entitled=false
  features: ModuleFeature[]; // Features user can potentially access
}

// Feature access result
export interface FeatureAccess {
  feature_key: string;
  feature_label: string;
  allowed: boolean; // Module entitled AND user has permission
  reason?: string; // Why denied if allowed=false
  module_entitled: boolean;
  user_permission: boolean;
}

// Role permission
export interface RolePermission {
  id: string;
  business_id: string;
  role: string;
  permission: string;
  created_at: string;
}

// Audit log entry
export interface EntitlementAuditLog {
  id: string;
  event_type: string;
  resource_type: string;
  resource_id?: string;
  actor_id?: string;
  changes?: Record<string, any>;
  created_at: string;
}

// Context for entitlement checks
export interface EntitlementContext {
  tenant_id: string;
  business_id: string;
  user_id: string;
  user_role: string;
  subscription?: TenantSubscription;
  plan?: SubscriptionPlan;
  permissions: Set<string>;
}
