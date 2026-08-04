// Theme presets for StratusPOS.
// Each preset is based on a complete, selectable brand palette.

export type ThemeKey =
  | "frosty-ash"
  | "ocean-breeze"
  | "mystic-midnight"
  | "enchanted-forest"
  | "black-gold-elegance"
  | "warm-autumn-glow";

export interface ThemeDef {
  key: ThemeKey;
  label: string;
  primary: string;
  primaryGlow: string;
  alt: string;
  swatch: string;
  colors: string[];
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  "frosty-ash": {
    key: "frosty-ash",
    label: "Frosty Ash Shades",
    primary: "210 3% 50%",
    primaryGlow: "210 5% 67%",
    alt: "210 17% 98%",
    swatch: "#5F6266",
    colors: ["#F8F9FA", "#CFD1D4", "#A5A9AE", "#5F6266", "#181B1E"],
  },
  "ocean-breeze": {
    key: "ocean-breeze",
    label: "Ocean Breeze Blues",
    primary: "209 71% 26%",
    primaryGlow: "207 62% 45%",
    alt: "210 15% 92%",
    swatch: "#134470",
    colors: ["#031A2D", "#134470", "#2C78BA", "#B0B7BA", "#E6EAED"],
  },
  "mystic-midnight": {
    key: "mystic-midnight",
    label: "Mystic Midnight Blues",
    primary: "223 65% 37%",
    primaryGlow: "222 57% 32%",
    alt: "216 58% 96%",
    swatch: "#21439B",
    colors: ["#EFF3FA", "#21439B", "#233D7F", "#253663", "#28292A"],
  },
  "enchanted-forest": {
    key: "enchanted-forest",
    label: "Enchanted Forest",
    primary: "124 18% 31%",
    primaryGlow: "124 18% 56%",
    alt: "120 32% 96%",
    swatch: "#415D43",
    colors: ["#F2F8F2", "#CDE0D0", "#7DA182", "#415D43", "#111D13"],
  },
  "black-gold-elegance": {
    key: "black-gold-elegance",
    label: "Black & Gold Elegance",
    primary: "38 97% 53%",
    primaryGlow: "38 97% 62%",
    alt: "0 0% 90%",
    swatch: "#FCA311",
    colors: ["#000000", "#14213D", "#FCA311", "#E5E5E5", "#FFFFFF"],
  },
  "warm-autumn-glow": {
    key: "warm-autumn-glow",
    label: "Warm Autumn Glow",
    primary: "31 100% 48%",
    primaryGlow: "40 97% 64%",
    alt: "47 52% 91%",
    swatch: "#F77F00",
    colors: ["#003049", "#D62828", "#F77F00", "#FCBF49", "#EAE2B7"],
  },
};

export const DEFAULT_THEME: ThemeKey = "ocean-breeze";

function parseHSL(triplet: string): { h: number; s: number; l: number } {
  const [h, s, l] = triplet.split(" ").map((v) => parseFloat(v));
  return { h, s, l };
}

export function applyTheme(themeKey: string | undefined | null) {
  const key = (themeKey || DEFAULT_THEME) as ThemeKey;
  const theme = THEMES[key] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;

  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-glow", theme.primaryGlow);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--table-alt-row", theme.alt);

  const { h, s: sat, l } = parseHSL(theme.primary);
  const clamp = (v: number) => Math.max(6, Math.min(94, v));
  root.style.setProperty("--sidebar-background", `${h} ${sat}% ${clamp(l)}%`);
  root.style.setProperty("--sidebar-foreground", "0 0% 100%");
  root.style.setProperty("--sidebar-primary", "0 0% 100%");
  root.style.setProperty("--sidebar-primary-foreground", `${h} ${sat}% ${clamp(l)}%`);
  root.style.setProperty("--sidebar-accent", `${h} ${sat}% ${clamp(l - 10)}%`);
  root.style.setProperty("--sidebar-accent-foreground", "0 0% 100%");
  root.style.setProperty("--sidebar-border", `${h} ${sat}% ${clamp(l - 8)}%`);
  root.style.setProperty("--sidebar-ring", "0 0% 100%");
  root.dataset.theme = key;
}

export type BusinessType = "general" | "minimart" | "liquor_store" | "pharmacy" | "clothing";

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "general", label: "General / Other" },
  { value: "minimart", label: "Minimart" },
  { value: "liquor_store", label: "Liquor Store" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "clothing", label: "Clothing & Apparel" },
];
