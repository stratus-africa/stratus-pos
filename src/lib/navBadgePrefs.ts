import { supabase } from "@/integrations/supabase/client";

/**
 * Per-tenant preferences controlling which notification/alert badges show up on
 * the mobile bottom navigation. Stored in `business_settings` so every user of
 * a tenant shares the same configuration, with a local cache for instant paint.
 */
export interface NavBadgePrefs {
  /** Master switch — when false no badges render at all. */
  enabled: boolean;
  /** Roll unread counts of hidden tabs into the "More" badge. */
  rollUpHidden: boolean;
  /** Per top-level route opt-out, e.g. { "/inventory": false }. */
  routes: Record<string, boolean>;
}

export const DEFAULT_NAV_BADGE_PREFS: NavBadgePrefs = {
  enabled: true,
  rollUpHidden: true,
  routes: {},
};

const SETTING_KEY = "mobile.navBadges";
const cacheKey = (businessId?: string | null) =>
  `mobile.navBadges.${businessId ?? "anon"}`;

function normalize(raw: unknown): NavBadgePrefs {
  const parsed = (raw || {}) as Partial<NavBadgePrefs>;
  return {
    ...DEFAULT_NAV_BADGE_PREFS,
    ...parsed,
    routes:
      parsed.routes && typeof parsed.routes === "object" ? { ...parsed.routes } : {},
  };
}

/** Synchronous read from the local cache. */
export function loadNavBadgePrefs(businessId?: string | null): NavBadgePrefs {
  try {
    const raw = localStorage.getItem(cacheKey(businessId));
    return raw ? normalize(JSON.parse(raw)) : DEFAULT_NAV_BADGE_PREFS;
  } catch {
    return DEFAULT_NAV_BADGE_PREFS;
  }
}

export async function fetchNavBadgePrefs(businessId: string): Promise<NavBadgePrefs> {
  const { data } = await supabase
    .from("business_settings" as any)
    .select("value")
    .eq("business_id", businessId)
    .eq("key", SETTING_KEY)
    .maybeSingle();
  const value = (data as any)?.value;
  const merged = value ? normalize(value) : loadNavBadgePrefs(businessId);
  try {
    localStorage.setItem(cacheKey(businessId), JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

export async function saveNavBadgePrefs(prefs: NavBadgePrefs, businessId?: string | null) {
  const clean = normalize(prefs);
  try {
    localStorage.setItem(cacheKey(businessId), JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent("nav-badge-prefs-changed"));
  } catch {
    /* ignore */
  }
  if (!businessId) return;
  const { error } = await supabase.from("business_settings" as any).upsert(
    {
      business_id: businessId,
      key: SETTING_KEY,
      value: clean as any,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "business_id,key" } as any,
  );
  if (error) throw error;
}

/** Is the badge for a given nav target allowed to render? */
export function isBadgeEnabled(prefs: NavBadgePrefs, target: string) {
  if (!prefs.enabled) return false;
  const root = "/" + (target.split("/").filter(Boolean)[0] ?? "");
  return prefs.routes[root] !== false;
}
