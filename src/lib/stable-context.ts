import { createContext, type Context } from "react";

/**
 * Creates a React context whose identity survives Vite HMR / dependency
 * re-optimization. Without this, a hot update to a provider module produces a
 * brand-new context object while already-mounted consumers still read the old
 * one, which surfaces as "useX must be used within XProvider" and a blank page.
 */
const registry: Map<string, Context<unknown>> =
  ((globalThis as Record<string, unknown>).__lovable_contexts as Map<string, Context<unknown>>) ??
  new Map<string, Context<unknown>>();
(globalThis as Record<string, unknown>).__lovable_contexts = registry;

export function createStableContext<T>(key: string, defaultValue: T): Context<T> {
  const existing = registry.get(key);
  if (existing) return existing as Context<T>;
  const created = createContext<T>(defaultValue);
  registry.set(key, created as Context<unknown>);
  return created;
}
