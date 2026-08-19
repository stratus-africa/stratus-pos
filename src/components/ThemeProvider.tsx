import { useEffect, useState, type ReactNode } from "react";
import {
  applyTheme,
  DEFAULT_MODE,
  DEFAULT_THEME,
  getInitialMode,
  getInitialTheme,
  ThemeContext,
  THEMES,
  type ThemeKey,
  type ThemeMode,
} from "@/lib/themes";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(() => getInitialTheme());
  const [mode, setModeState] = useState<ThemeMode>(() => getInitialMode());

  useEffect(() => {
    let cancelled = false;

    const loadGlobalBranding = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await (supabase as any).from("app_settings").select("value").eq("key", "global").maybeSingle();
        const configured = (data?.value as { theme_color?: string } | null)?.theme_color;
        if (!cancelled && configured && configured in THEMES) {
          setThemeState(configured as ThemeKey);
          applyTheme(configured, undefined, mode);
        }
      } catch {
        // Keep the locally cached/default theme if global branding is unavailable.
      }
    };

    void loadGlobalBranding();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(theme, undefined, mode);
  }, [mode, theme]);

  const setTheme = (nextTheme: ThemeKey) => {
    setThemeState(nextTheme);
    applyTheme(nextTheme, undefined, mode);
  };

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    applyTheme(theme, undefined, nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: theme || DEFAULT_THEME,
        mode: mode || DEFAULT_MODE,
        setTheme,
        setMode,
        themes: THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
