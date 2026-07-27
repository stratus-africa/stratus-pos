import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Unread notification counts bucketed by the top-level route they link to,
 * e.g. { "/inventory": 3, "/sales": 1 }.
 */
export function useNavBadges() {
  const { user } = useAuth();
  const [rows, setRows] = useState<{ link: string | null }[]>([]);

  useEffect(() => {
    if (!user) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("link")
        .eq("user_id", user.id)
        .is("read_at", null)
        .limit(200);
      if (!cancelled) setRows((data as { link: string | null }[]) || []);
    };
    load();
    const ch = supabase
      .channel(`nav-badges-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (!r.link) continue;
      const path = r.link.split("?")[0].split("#")[0];
      const root = "/" + (path.split("/").filter(Boolean)[0] ?? "");
      counts[root] = (counts[root] ?? 0) + 1;
    }
    counts.__total = rows.length;
    return counts;
  }, [rows]);
}

/** Matches a nav target against the current pathname, including deep links. */
export function matchesRoute(target: string, pathname: string) {
  const norm = (p: string) => {
    const cleaned = p.split("?")[0].split("#")[0].replace(/\/+$/, "");
    return cleaned === "" ? "/" : cleaned;
  };
  const t = norm(target);
  const p = norm(pathname);
  if (t === "/") return p === "/";
  return p === t || p.startsWith(t + "/");
}

/** Picks the nav target that most specifically matches the current pathname. */
export function bestMatch(targets: string[], pathname: string) {
  let best: string | null = null;
  for (const t of targets) {
    if (!matchesRoute(t, pathname)) continue;
    if (best === null || t.length > best.length) best = t;
  }
  return best;
}

const STORAGE_KEY = "mobile_quick_tabs";

/** User-chosen quick tabs for the mobile pill, persisted locally. */
export function useQuickTabPrefs(maxTabs = 4) {
  const [selected, setSelected] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  });

  const persist = (next: string[]) => {
    setSelected(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const toggle = (key: string) => {
    if (selected.includes(key)) {
      persist(selected.filter((k) => k !== key));
    } else if (selected.length < maxTabs) {
      persist([...selected, key]);
    }
  };

  const reset = () => persist([]);

  return { selected, toggle, reset, maxTabs, isCustomized: selected.length > 0 };
}
