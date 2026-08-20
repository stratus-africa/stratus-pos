export type SubscriptionPlanInput = {
  product_id?: string | null;
  plan_code?: string | null;
  environment?: string | null;
  status?: string | null;
  created_at?: string | null;
  id?: string | null;
  user_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
};

export type SubscriptionPlanLike = {
  id: string;
  name?: string | null;
  is_active?: boolean | null;
  is_public?: boolean | null;
  paystack_plan_code_monthly?: string | null;
  paystack_plan_code_yearly?: string | null;
  sort_order?: number | null;
  [key: string]: any;
};

export type SubscriptionBusinessLike = {
  selected_package_id?: string | null;
  [key: string]: any;
};

const normalizeValue = (value: unknown): string => String(value ?? "").trim();

const isMatchById = (plan: SubscriptionPlanLike, planId: string | null | undefined) => {
  if (!planId) return false;
  return normalizeValue(plan.id) === normalizeValue(planId);
};

export function resolveSubscriptionPlan(
  subscription: SubscriptionPlanInput | null | undefined,
  plans: SubscriptionPlanLike[] = [],
  business?: SubscriptionBusinessLike | null,
) {
  const planList = Array.isArray(plans) ? plans : [];
  const freePlan = planList.find((plan) => normalizeValue(plan.name).toLowerCase() === "free") ?? null;
  const selectedPackageId = business?.selected_package_id ?? null;
  const productId = subscription?.product_id ?? null;
  const planCode = subscription?.plan_code ?? null;

  const bySelectedPkg = planList.find((plan) => isMatchById(plan, selectedPackageId));
  if (bySelectedPkg) return bySelectedPkg;

  const byProduct = planList.find((plan) => isMatchById(plan, productId));
  if (byProduct) return byProduct;

  const byPlanCode = planList.find((plan) => {
    if (!planCode) return false;
    const monthly = normalizeValue(plan.paystack_plan_code_monthly);
    const yearly = normalizeValue(plan.paystack_plan_code_yearly);
    return monthly === normalizeValue(planCode) || yearly === normalizeValue(planCode);
  });
  if (byPlanCode) return byPlanCode;

  // Only fall back to free when there is truly no assigned package context.
  // An active subscription with a missing or invalid package must surface an error,
  // not silently assume the free tier.
  const status = normalizeValue(subscription?.status).toLowerCase();
  const isActiveSubscription = status === "active" || status === "trialing";
  if (isActiveSubscription && !selectedPackageId && !productId && !planCode) {
    return null;
  }

  return freePlan ?? null;
}

export function isSubscriptionCurrentlyActive(
  subscription: SubscriptionPlanInput | null | undefined,
  now = Date.now(),
) {
  if (!subscription) return false;

  const status = normalizeValue(subscription.status).toLowerCase();
  if (status !== "active" && status !== "trialing") return false;

  if (!subscription.current_period_end) return true;

  const endsAt = new Date(subscription.current_period_end).getTime();
  return Number.isNaN(endsAt) || endsAt > now;
}

export function resolvePreferredSubscription<T extends SubscriptionPlanInput>(subscriptions: T[] = []) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) return null;

  const getStatusRank = (item: T) => {
    const status = normalizeValue(item.status).toLowerCase();

    // A currently-valid subscription must always outrank an expired/cancelled
    // record, regardless of whether the stale record is from live Paystack.
    if (isSubscriptionCurrentlyActive(item)) {
      return status === "active" ? 4 : 3;
    }

    // Keep non-active records available as a fallback so the UI can still show
    // the actual subscription state instead of pretending there is no record.
    if (status === "pending") return 2;
    if (status === "past_due") return 1;
    return 0;
  };

  const getEnvRank = (item: T) => {
    const env = normalizeValue(item.environment).toLowerCase();
    if (env === "live") return 2;
    if (env === "sandbox") return 1;
    return 0;
  };

  const order = [...subscriptions].sort((a, b) => {
    const statusDiff = getStatusRank(b) - getStatusRank(a);
    if (statusDiff !== 0) return statusDiff;

    const envDiff = getEnvRank(b) - getEnvRank(a);
    if (envDiff !== 0) return envDiff;

    const endA = a.current_period_end ? new Date(a.current_period_end).getTime() : 0;
    const endB = b.current_period_end ? new Date(b.current_period_end).getTime() : 0;
    if (endB !== endA) return endB - endA;

    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });

  return order[0] ?? null;
}
