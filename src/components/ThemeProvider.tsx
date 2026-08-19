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
  type ThemeScope,
} from "@/lib/themes";

function getScope(): ThemeScope {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/super-admin") ? "super-admin" : "tenant";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scope = getScope();
  const [theme, setThemeState] = useState<ThemeKey>(() => getInitialTheme(scope));
  const [mode, setModeState] = useState<ThemeMode>(() => getInitialMode());

  useEffect(() => {
    applyTheme(theme, scope, mode);
  }, [mode, scope, theme]);

  const setTheme = (nextTheme: ThemeKey, nextScope: ThemeScope = scope) => {
    setThemeState(nextTheme);
    applyTheme(nextTheme, nextScope, mode);
  };

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    applyTheme(theme, scope, nextMode);
  };

  return <ThemeContext.Provider value={{ theme: theme || DEFAULT_THEME, mode: mode || DEFAULT_MODE, setTheme, setMode, themes: THEMES }}>{children}</ThemeContext.Provider>;
}
