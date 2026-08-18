import { describe, expect, it } from "vitest";
import { resolveSubscriptionPlan, resolvePreferredSubscription } from "./subscriptionPlan";

describe("subscription plan resolution", () => {
  const plans = [
    {
      id: "free-id",
      name: "Free",
      is_active: true,
      is_public: true,
      monthly_price_kes: 0,
      yearly_price_kes: 0,
      sort_order: 1,
    },
    {
      id: "starter-id",
      name: "Starter",
      is_active: true,
      is_public: true,
      monthly_price_kes: 1000,
      yearly_price_kes: 10000,
      sort_order: 2,
      paystack_plan_code_monthly: "starter-monthly",
      paystack_plan_code_yearly: "starter-yearly",
    },
    {
      id: "enterprise-id",
      name: "Enterprise",
      is_active: true,
      is_public: true,
      monthly_price_kes: 5000,
      yearly_price_kes: 50000,
      sort_order: 3,
      paystack_plan_code_monthly: "enterprise-monthly",
      paystack_plan_code_yearly: "enterprise-yearly",
    },
  ] as any[];

  it("matches product_id before other fallback sources", () => {
    const plan = resolveSubscriptionPlan(
      { product_id: "enterprise-id", plan_code: "starter-monthly", environment: "live", status: "active" },
      plans,
      { selected_package_id: "starter-id" },
    );
    expect(plan?.name).toBe("Enterprise");
  });

  it("falls back to the Paystack plan code when product_id is absent", () => {
    const plan = resolveSubscriptionPlan(
      { product_id: null, plan_code: "enterprise-yearly", environment: "live", status: "active" },
      plans,
      { selected_package_id: null },
    );
    expect(plan?.name).toBe("Enterprise");
  });

  it("uses the selected_package_id when subscription identifiers are missing", () => {
    const plan = resolveSubscriptionPlan(
      { product_id: null, plan_code: null, environment: "live", status: "active" },
      plans,
      { selected_package_id: "starter-id" },
    );
    expect(plan?.name).toBe("Starter");
  });

  it("falls back to Free only when no paid plan matches", () => {
    const plan = resolveSubscriptionPlan(
      { product_id: null, plan_code: "unknown-plan", environment: "live", status: "active" },
      plans,
      { selected_package_id: "missing-id" },
    );
    expect(plan?.name).toBe("Free");
  });

  it("does not silently fall back to free when an active subscription is unresolved", () => {
    const plan = resolveSubscriptionPlan(
      { product_id: null, plan_code: null, environment: "live", status: "active" },
      plans,
      { selected_package_id: null },
    );
    expect(plan).toBeNull();
  });

  it("prefers the active live subscription over an inactive or sandbox subscription", () => {
    const chosen = resolvePreferredSubscription([
      {
        id: "old",
        user_id: "u1",
        product_id: "starter-id",
        plan_code: "starter-monthly",
        environment: "sandbox",
        status: "canceled",
        created_at: "2024-01-01",
      },
      {
        id: "latest",
        user_id: "u1",
        product_id: "enterprise-id",
        plan_code: "enterprise-monthly",
        environment: "live",
        status: "active",
        created_at: "2024-03-01",
      },
      {
        id: "old-live",
        user_id: "u1",
        product_id: "starter-id",
        plan_code: "starter-monthly",
        environment: "live",
        status: "trialing",
        created_at: "2024-02-01",
      },
    ] as any[]);

    expect(chosen?.id).toBe("latest");
  });
});
