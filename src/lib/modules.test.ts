import { describe, expect, it } from "vitest";
import {
  findModule,
  resolveModuleAccess,
  getVisibleModules,
  MODULE_REGISTRY,
  getEnabledCanonicalModules,
} from "./modules";
import { resolveFeatureAccess } from "../hooks/useSubscription";

describe("module registry and access control", () => {
  it("keeps a single authoritative registry and exposes an accounting module hierarchy", () => {
    expect(MODULE_REGISTRY.length).toBeGreaterThan(0);
    const accounting = findModule("accounting");
    expect(accounting).toBeDefined();
    expect(accounting?.category).toBe("finance");
    expect(accounting?.navigation.some((item) => item.key === "banking")).toBe(true);
  });

  it("blocks a locked module when the subscription feature is unavailable", () => {
    const state = resolveModuleAccess("bakery", {
      role: "manager",
      subscriptions: new Set(),
      permissions: new Set(["bakery.view"]),
      featureKey: () => false,
      moduleEnabled: () => true,
      dependenciesReady: () => true,
      setupComplete: () => true,
    });

    expect(state.allowed).toBe(false);
    expect(state.state).toBe("locked");
  });

  it("allows access when subscription, role, permission, and dependency checks all pass", () => {
    const state = resolveModuleAccess("inventory", {
      role: "manager",
      subscriptions: new Set(["inventory"]),
      permissions: new Set(["inventory.view"]),
      featureKey: () => true,
      moduleEnabled: () => true,
      dependenciesReady: () => true,
      setupComplete: () => true,
    });

    expect(state.allowed).toBe(true);
    expect(state.state).toBe("enabled");
  });

  it("filters module visibility to the user’s accessible set", () => {
    const visible = getVisibleModules(["dashboard", "inventory", "bakery", "accounting"], {
      role: "manager",
      subscriptions: new Set(["dashboard", "inventory", "accounting"]),
      permissions: new Set(["dashboard.view", "inventory.view", "accounting.view"]),
      featureKey: (key) => ["dashboard", "inventory", "accounting"].includes(key),
      moduleEnabled: () => true,
      dependenciesReady: () => true,
      setupComplete: () => true,
    });

    expect(visible).toEqual(["dashboard", "inventory", "accounting"]);
  });

  it("counts only canonical modules when aliases are enabled", () => {
    const enabled = getEnabledCanonicalModules(
      [
        { package_id: "pkg-1", feature_key: "accounting", enabled: true },
        { package_id: "pkg-1", feature_key: "manual_journals", enabled: true },
        { package_id: "pkg-1", feature_key: "journal_entries", enabled: true },
        { package_id: "pkg-1", feature_key: "inventory", enabled: true },
      ],
      "pkg-1",
    );

    expect(enabled).toHaveLength(2);
    expect(enabled).toEqual(expect.arrayContaining(["accounting", "inventory"]));
  });

  it("keeps modules visible for an active subscription when package metadata is temporarily unavailable", () => {
    expect(
      resolveFeatureAccess({
        isActive: true,
        currentPackage: null,
        enabledFeatureKeys: new Set(),
        key: "inventory",
      }),
    ).toBe(true);

    expect(
      resolveFeatureAccess({
        isActive: false,
        currentPackage: null,
        enabledFeatureKeys: new Set(),
        key: "inventory",
      }),
    ).toBe(false);
  });
});
