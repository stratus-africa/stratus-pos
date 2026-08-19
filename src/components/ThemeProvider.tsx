import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
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

function getScope(pathname: string): ThemeScope {
  return pathname.startsWith("/super-admin") ? "super-admin" : "tenant";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const scope = getScope(pathname);
  const [theme, setThemeState] = useState<ThemeKey>(() => getInitialTheme(scope));
  const [mode, setModeState] = useState<ThemeMode>(() => getInitialMode());

  useEffect(() => {
    const storedTheme = getInitialTheme(scope);
    setThemeState(storedTheme);
    applyTheme(storedTheme, scope, mode);
  }, [scope, mode]);

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
