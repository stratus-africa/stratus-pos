// Theme presets for StratusPOS.
// Each preset is a brand theme expressed through shadcn semantic CSS variables.

export type ThemeKey = "fiery-red" | "deep-blue-green" | "minty-serenity" | "light-steel";

export interface ThemeDef {
  key: ThemeKey;
  label: string;
  description: string;
  swatch: string;
  colors: string[];
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  "fiery-red": {
    key: "fiery-red",
    label: "Fiery Red Inferno",
    description: "Dark · Bold · Premium",
    swatch: "#650000",
    colors: ["#0F0606", "#200B0B", "#2F0000", "#490000", "#650000"],
  },
  "deep-blue-green": {
    key: "deep-blue-green",
    label: "Deep Blue & Green",
    description: "Enterprise · Professional · Modern",
    swatch: "#005595",
    colors: ["#041630", "#00814A", "#CFD1D5", "#005595", "#27364C"],
  },
  "minty-serenity": {
    key: "minty-serenity",
    label: "Minty Serenity",
    description: "Calm · Clean · Sophisticated",
    swatch: "#284B63",
    colors: ["#B4B8AB", "#153243", "#284B63", "#F4F9E9", "#EEF0EB"],
  },
  "light-steel": {
    key: "light-steel",
    label: "Light Steel",
    description: "Minimal · Neutral · Professional",
    swatch: "#6C757D",
    colors: ["#F8F9FA", "#E9ECEF", "#DEE2E6", "#CED4DA", "#ADB5BD", "#6C757D", "#495057", "#343A40", "#212529"],
  },
};

export const DEFAULT_THEME: ThemeKey = "light-steel";

export function resolveThemeKey(themeKey?: string | null): ThemeKey {
  return themeKey && themeKey in THEMES ? (themeKey as ThemeKey) : DEFAULT_THEME;
}

export type ThemeScope = "tenant" | "super-admin";

export function getThemeStorageKey(scope: ThemeScope = "tenant") {
  return scope === "super-admin" ? "stratus-super-admin-theme" : "stratus-tenant-theme";
}

const THEME_CSS_VARIABLES: Record<ThemeKey, Record<string, string>> = {
  "fiery-red": {
    "--background": "0 19% 9%",
    "--foreground": "0 0% 95%",
    "--card": "0 33% 12%",
    "--card-foreground": "0 0% 95%",
    "--popover": "0 33% 12%",
    "--popover-foreground": "0 0% 95%",
    "--primary": "0 100% 19%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "0 30% 16%",
    "--secondary-foreground": "0 0% 95%",
    "--muted": "0 18% 16%",
    "--muted-foreground": "0 14% 75%",
    "--accent": "0 30% 18%",
    "--accent-foreground": "0 0% 95%",
    "--destructive": "5 72% 57%",
    "--destructive-foreground": "0 0% 100%",
    "--success": "142 71% 45%",
    "--success-foreground": "0 0% 100%",
    "--warning": "36 92% 48%",
    "--warning-foreground": "0 0% 100%",
    "--info": "210 90% 47%",
    "--info-foreground": "0 0% 100%",
    "--border": "0 20% 24%",
    "--input": "0 18% 18%",
    "--ring": "0 88% 40%",
    "--sidebar-background": "0 24% 10%",
    "--sidebar-foreground": "0 0% 95%",
    "--sidebar-primary": "0 100% 19%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-accent": "0 36% 18%",
    "--sidebar-accent-foreground": "0 0% 95%",
    "--sidebar-border": "0 28% 20%",
    "--sidebar-ring": "0 88% 40%",
    "--table-alt-row": "0 20% 12%",
    "--primary-glow": "0 80% 35%",
  },
  "deep-blue-green": {
    "--background": "212 83% 11%",
    "--foreground": "210 20% 95%",
    "--card": "213 36% 17%",
    "--card-foreground": "210 20% 95%",
    "--popover": "213 36% 17%",
    "--popover-foreground": "210 20% 95%",
    "--primary": "202 100% 29%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "211 34% 26%",
    "--secondary-foreground": "210 20% 95%",
    "--muted": "211 34% 22%",
    "--muted-foreground": "210 12% 82%",
    "--accent": "152 100% 26%",
    "--accent-foreground": "0 0% 100%",
    "--destructive": "0 84% 60%",
    "--destructive-foreground": "0 0% 100%",
    "--success": "147 78% 32%",
    "--success-foreground": "0 0% 100%",
    "--warning": "42 93% 52%",
    "--warning-foreground": "0 0% 100%",
    "--info": "210 90% 47%",
    "--info-foreground": "0 0% 100%",
    "--border": "213 22% 30%",
    "--input": "210 22% 22%",
    "--ring": "204 100% 29%",
    "--sidebar-background": "212 80% 12%",
    "--sidebar-foreground": "210 20% 96%",
    "--sidebar-primary": "202 100% 29%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-accent": "210 30% 26%",
    "--sidebar-accent-foreground": "210 20% 96%",
    "--sidebar-border": "213 20% 27%",
    "--sidebar-ring": "202 100% 29%",
    "--table-alt-row": "213 25% 19%",
    "--primary-glow": "202 95% 42%",
  },
  "minty-serenity": {
    "--background": "90 12% 88%",
    "--foreground": "206 33% 22%",
    "--card": "90 18% 95%",
    "--card-foreground": "206 33% 22%",
    "--popover": "90 18% 95%",
    "--popover-foreground": "206 33% 22%",
    "--primary": "206 36% 23%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "92 16% 86%",
    "--secondary-foreground": "206 33% 22%",
    "--muted": "90 16% 92%",
    "--muted-foreground": "206 20% 35%",
    "--accent": "90 17% 96%",
    "--accent-foreground": "206 33% 22%",
    "--destructive": "0 84% 60%",
    "--destructive-foreground": "0 0% 100%",
    "--success": "142 71% 45%",
    "--success-foreground": "0 0% 100%",
    "--warning": "35 75% 50%",
    "--warning-foreground": "0 0% 100%",
    "--info": "210 90% 47%",
    "--info-foreground": "0 0% 100%",
    "--border": "210 25% 72%",
    "--input": "90 15% 91%",
    "--ring": "206 36% 23%",
    "--sidebar-background": "206 36% 23%",
    "--sidebar-foreground": "90 15% 94%",
    "--sidebar-primary": "206 36% 23%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-accent": "206 28% 30%",
    "--sidebar-accent-foreground": "90 15% 94%",
    "--sidebar-border": "206 28% 30%",
    "--sidebar-ring": "206 36% 23%",
    "--table-alt-row": "90 16% 92%",
    "--primary-glow": "206 36% 35%",
  },
  "light-steel": {
    "--background": "210 17% 96%",
    "--foreground": "210 9% 18%",
    "--card": "0 0% 100%",
    "--card-foreground": "210 9% 18%",
    "--popover": "0 0% 100%",
    "--popover-foreground": "210 9% 18%",
    "--primary": "210 9% 25%",
    "--primary-foreground": "0 0% 100%",
    "--secondary": "210 15% 94%",
    "--secondary-foreground": "210 9% 18%",
    "--muted": "210 15% 94%",
    "--muted-foreground": "210 6% 46%",
    "--accent": "210 15% 90%",
    "--accent-foreground": "210 9% 18%",
    "--destructive": "0 84% 60%",
    "--destructive-foreground": "0 0% 100%",
    "--success": "142 71% 45%",
    "--success-foreground": "0 0% 100%",
    "--warning": "38 92% 50%",
    "--warning-foreground": "0 0% 100%",
    "--info": "210 90% 47%",
    "--info-foreground": "0 0% 100%",
    "--border": "210 14% 86%",
    "--input": "210 14% 90%",
    "--ring": "210 9% 25%",
    "--sidebar-background": "210 14% 97%",
    "--sidebar-foreground": "210 9% 18%",
    "--sidebar-primary": "210 9% 25%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-accent": "210 18% 92%",
    "--sidebar-accent-foreground": "210 9% 18%",
    "--sidebar-border": "210 14% 86%",
    "--sidebar-ring": "210 9% 25%",
    "--table-alt-row": "210 18% 95%",
    "--primary-glow": "210 8% 40%",
  },
};

export function applyTheme(themeKey?: string | null, scope: ThemeScope = "tenant") {
  const key = resolveThemeKey(themeKey);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = key;

    const values = THEME_CSS_VARIABLES[key];
    for (const [cssVar, value] of Object.entries(values)) {
      root.style.setProperty(cssVar, value);
    }
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(getThemeStorageKey(scope), key);
  }
}

export function initializeTheme(scope: ThemeScope = "tenant") {
  if (typeof window === "undefined") return;
  const saved = window.localStorage.getItem(getThemeStorageKey(scope));
  applyTheme(saved || DEFAULT_THEME, scope);
}

export function getInitialTheme(scope: ThemeScope = "tenant") {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const saved = window.localStorage.getItem(getThemeStorageKey(scope));
  return resolveThemeKey(saved || DEFAULT_THEME);
}

export type BusinessType = "general" | "minimart" | "liquor_store" | "pharmacy" | "clothing";

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "general", label: "General / Other" },
  { value: "minimart", label: "Minimart" },
  { value: "liquor_store", label: "Liquor Store" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "clothing", label: "Clothing & Apparel" },
];
