// Theme presets for StratusPOS.
// Each theme defines:
// - primary: HSL triplet used as --primary
// - alt: HSL triplet used as --table-alt-row (lighter shade applied to alternating rows)
// - label: human-readable name for settings UI

export type ThemeKey =
  | "carnelian-red"
  | "chili-red"
  | "forest-green"
  | "jade-green"
  | "cobalt-blue"
  | "teal"
  | "byzantium"
  | "deep-sea-blue";


export interface ThemeDef {
  key: ThemeKey;
  label: string;
  primary: string;       // HSL triplet "h s% l%"
  primaryGlow: string;   // lighter shade for hover/glow
  alt: string;           // very light shade used for alt-row tint
  swatch: string;        // hex for picker swatches
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  "carnelian-red": {
    key: "carnelian-red",
    label: "Carnelian Red",
    primary: "0 70% 42%",
    primaryGlow: "0 80% 55%",
    alt: "0 70% 96%",
    swatch: "#B22222",
  },
  "chili-red": {
    key: "chili-red",
    label: "Chili Red",
    primary: "8 85% 50%",
    primaryGlow: "8 90% 62%",
    alt: "8 85% 96%",
    swatch: "#E52B16",
  },
  "forest-green": {
    key: "forest-green",
    label: "Forest Green",
    primary: "140 60% 28%",
    primaryGlow: "140 55% 40%",
    alt: "140 50% 95%",
    swatch: "#1F6F3D",
  },
  "jade-green": {
    key: "jade-green",
    label: "Jade Green",
    primary: "162 65% 38%",
    primaryGlow: "162 60% 50%",
    alt: "162 60% 95%",
    swatch: "#22A47A",
  },
  "cobalt-blue": {
    key: "cobalt-blue",
    label: "Cobalt Blue",
    primary: "217 91% 50%",
    primaryGlow: "217 91% 62%",
    alt: "217 91% 96%",
    swatch: "#1E66E0",
  },
  "teal": {
    key: "teal",
    label: "Teal",
    primary: "180 70% 32%",
    primaryGlow: "180 65% 44%",
    alt: "180 60% 95%",
    swatch: "#188F8F",
  },
  "deep-sea-blue": {
    key: "deep-sea-blue",
    label: "Deep Sea Blue",
    primary: "203 98% 20%",
    primaryGlow: "203 85% 32%",
    alt: "203 70% 96%",
    swatch: "#023047",
  },
  "byzantium": {
    key: "byzantium",
    label: "Byzantium",
    primary: "317 51% 28%",
    primaryGlow: "317 48% 42%",
    alt: "317 50% 96%",
    swatch: "#702963",
  },
};

export const DEFAULT_THEME: ThemeKey = "cobalt-blue";

/**
 * Parse "h s% l%" to numeric components for derived shades.
 */
function parseHSL(triplet: string): { h: number; s: number; l: number } {
  const [h, s, l] = triplet.split(" ").map((v) => parseFloat(v));
  return { h, s, l };
}

export function applyTheme(themeKey: string | undefined | null) {
  const key = (themeKey || DEFAULT_THEME) as ThemeKey;
  const theme = THEMES[key] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;

  // Core primary tokens
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-glow", theme.primaryGlow);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--table-alt-row", theme.alt);

  // Sidebar takes the brand color with white text
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

// Business types — drives industry-specific feature gating
export type BusinessType = "general" | "minimart" | "liquor_store" | "pharmacy" | "clothing";

export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "general", label: "General / Other" },
  { value: "minimart", label: "Minimart" },
  { value: "liquor_store", label: "Liquor Store" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "clothing", label: "Clothing & Apparel" },
];
