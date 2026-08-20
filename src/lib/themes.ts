import { useContext } from "react";
import { createStableContext } from "@/lib/stable-context";

export type ThemeKey =
  | "burgundy"
  | "moss"
  | "modern_minimal"
  | "midnight_blues"
  | "crafthive"
  | "openclaw"
  | "whatsapp";

export type ThemeMode = "light" | "dark";
export type ThemeTokens = Record<string, string>;

export interface ThemeDef {
  id: ThemeKey;
  name: string;
  description: string;
  preview: string[];
  light: ThemeTokens;
  dark: ThemeTokens;
}

const keys = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
];

const make = (values: string[], charts: string[], sidebar: string[]) => {
  const result: ThemeTokens = Object.fromEntries(keys.map((key, index) => [`--${key}`, values[index]]));

  [1, 2, 3, 4, 5].forEach((n, index) => {
    result[`--chart-${n}`] = charts[index];
  });

  [
    "sidebar",
    "sidebar-foreground",
    "sidebar-primary",
    "sidebar-primary-foreground",
    "sidebar-accent",
    "sidebar-accent-foreground",
    "sidebar-border",
    "sidebar-ring",
  ].forEach((key, index) => {
    result[`--${key}`] = sidebar[index];
  });

  // Status colors intentionally follow the selected brand instead of a
  // hard-coded green/amber/blue palette. Components can still use semantic
  // success/warning/info tokens without breaking the active theme.
  result["--success"] = values[6];
  result["--success-foreground"] = values[7];
  result["--warning"] = values[12];
  result["--warning-foreground"] = values[13];
  result["--info"] = values[6];
  result["--info-foreground"] = values[7];

  return result;
};

const theme = (
  id: ThemeKey,
  name: string,
  description: string,
  preview: string[],
  light: ThemeTokens,
  dark: ThemeTokens,
): ThemeDef => ({
  id,
  name,
  description,
  preview,
  light,
  dark,
});

export const THEMES: Record<ThemeKey, ThemeDef> = {
  burgundy: theme(
    "burgundy",
    "Burgundy",
    "Minimal and warm",
    ["#fdf8f9", "#800020", "#9a1b32", "#3d0a0d"],
    make(
      [
        "#fdf8f9",
        "#3d0a0d",
        "#ffffff",
        "#3d0a0d",
        "#ffffff",
        "#3d0a0d",
        "#800020",
        "#ffffff",
        "#f4e7ea",
        "#800020",
        "#f4e7ea",
        "#7c5c5f",
        "#9a1b32",
        "#ffffff",
        "#be123c",
        "#ffffff",
        "#e5d1d4",
        "#e5d1d4",
        "#800020",
      ],
      ["#800020", "#9a1b32", "#be123c", "#d44a63", "#ea869a"],
      ["#3d0a0d", "#fdf8f9", "#800020", "#ffffff", "#591116", "#fdf8f9", "#591116", "#800020"],
    ),
    make(
      [
        "#0f0203",
        "#fceef0",
        "#1a0507",
        "#fceef0",
        "#1a0507",
        "#fceef0",
        "#e63946",
        "#ffffff",
        "#3d0a0d",
        "#ffdce0",
        "#2a0a0d",
        "#d4a1a6",
        "#cd182a",
        "#ffffff",
        "#ff4d6d",
        "#ffffff",
        "#2b0d10",
        "#4a151b",
        "#ff2e44",
      ],
      ["#e63946", "#ff8fa3", "#800020", "#ffb3c1", "#591116"],
      ["#0a0102", "#fceef0", "#e63946", "#ffffff", "#1a0507", "#fceef0", "#2b0d10", "#e63946"],
    ),
  ),

  moss: theme(
    "moss",
    "Moss",
    "Minimal and nature-led",
    ["#fdfdfd", "#7F956A", "#495940", "#AFBEA5"],
    make(
      [
        "#fdfdfd",
        "#000000",
        "#fdfdfd",
        "#000000",
        "#fcfcfc",
        "#000000",
        "#7F956A",
        "#FFFFFF",
        "#D4D9D0",
        "#080808",
        "#f5f5f5",
        "#878787",
        "#495940",
        "#FFFF",
        "#b3191f",
        "#ffffff",
        "#e7e7ee",
        "#ebebeb",
        "#AFBEA5",
      ],
      ["#408a0f", "#59a626", "#73bd42", "#0051BA", "#a9e382"],
      ["#f5f8fb", "#000000", "#000000", "#ffffff", "#e4eae1", "#000000", "#ebebeb", "#AFBEA5"],
    ),
    make(
      [
        "#070503",
        "#f9f8f7",
        "#100d08",
        "#f9f8f7",
        "#0b0905",
        "#f9f8f7",
        "#AFBEA5",
        "#040302",
        "#26211a",
        "#e7e4df",
        "#1e1a14",
        "#928f8a",
        "#495940",
        "#FFF",
        "#b3191f",
        "#f9f8f7",
        "#2f281b",
        "#1a150e",
        "#AFBEA5",
      ],
      ["#408a0f", "#59a626", "#73bd42", "#a9e382", "#AFBEA5"],
      ["#040302", "#f0eeeb", "#AFBEA5", "#040302", "#495940", "#FFF", "#272117", "#AFBEA5"],
    ),
  ),

  modern_minimal: theme(
    "modern_minimal",
    "Modern Minimal",
    "Clean neutral and distraction-free",
    ["#f7f7f7", "#171717", "#e5e5e5", "#737373"],
    make(
      [
        "#f7f7f7",
        "#171717",
        "#ffffff",
        "#171717",
        "#ffffff",
        "#171717",
        "#171717",
        "#ffffff",
        "#ededed",
        "#262626",
        "#ededed",
        "#737373",
        "#e5e5e5",
        "#171717",
        "#dc2626",
        "#ffffff",
        "#dedede",
        "#dedede",
        "#171717",
      ],
      ["#171717", "#404040", "#737373", "#a3a3a3", "#d4d4d4"],
      ["#fafafa", "#171717", "#171717", "#ffffff", "#f0f0f0", "#171717", "#dedede", "#171717"],
    ),
    make(
      [
        "#0a0a0a",
        "#f5f5f5",
        "#141414",
        "#f5f5f5",
        "#141414",
        "#f5f5f5",
        "#f5f5f5",
        "#0a0a0a",
        "#262626",
        "#f5f5f5",
        "#262626",
        "#a3a3a3",
        "#333333",
        "#f5f5f5",
        "#ef4444",
        "#ffffff",
        "#333333",
        "#333333",
        "#f5f5f5",
      ],
      ["#f5f5f5", "#d4d4d4", "#a3a3a3", "#737373", "#525252"],
      ["#0a0a0a", "#f5f5f5", "#f5f5f5", "#0a0a0a", "#262626", "#f5f5f5", "#333333", "#f5f5f5"],
    ),
  ),

  midnight_blues: theme(
    "midnight_blues",
    "Midnight Blues",
    "Deep blue-black with soft lavender contrast",
    ["#000000", "#1b2a41", "#324a5f", "#ccc9dc"],
    make(
      [
        "#f5f6fa",
        "#0c1821",
        "#ffffff",
        "#0c1821",
        "#ffffff",
        "#0c1821",
        "#1b2a41",
        "#ffffff",
        "#e8ebf0",
        "#0c1821",
        "#e8ebf0",
        "#64748b",
        "#ccc9dc",
        "#0c1821",
        "#dc2626",
        "#ffffff",
        "#d5d9e2",
        "#d5d9e2",
        "#1b2a41",
      ],
      ["#1b2a41", "#324a5f", "#ccc9dc", "#0c1821", "#526a83"],
      ["#0c1821", "#f5f6fa", "#1b2a41", "#ffffff", "#324a5f", "#ffffff", "#324a5f", "#ccc9dc"],
    ),
    make(
      [
        "#000000",
        "#f2f0f8",
        "#0c1821",
        "#f2f0f8",
        "#0c1821",
        "#f2f0f8",
        "#324a5f",
        "#ffffff",
        "#1b2a41",
        "#f2f0f8",
        "#1b2a41",
        "#a7a4b8",
        "#ccc9dc",
        "#0c1821",
        "#ef4444",
        "#ffffff",
        "#324a5f",
        "#324a5f",
        "#ccc9dc",
      ],
      ["#324a5f", "#526a83", "#ccc9dc", "#1b2a41", "#71869d"],
      ["#000000", "#f2f0f8", "#ccc9dc", "#0c1821", "#1b2a41", "#f2f0f8", "#324a5f", "#ccc9dc"],
    ),
  ),

  crafthive: theme(
    "crafthive",
    "Crafthive",
    "Warm and professional",
    ["#ffffff", "#d87943", "#527575", "#fbcb97"],
    make(
      [
        "#ffffff",
        "#111827",
        "#ffffff",
        "#111827",
        "#ffffff",
        "#111827",
        "#d87943",
        "#ffffff",
        "#527575",
        "#ffffff",
        "#f3f4f6",
        "#6b7280",
        "#eeeeee",
        "#111827",
        "#ef4444",
        "#fafafa",
        "#e5e7eb",
        "#e5e7eb",
        "#d87943",
      ],
      ["#5f8787", "#e78a53", "#fbcb97", "#888888", "#999999"],
      ["#f3f4f6", "#111827", "#d87943", "#ffffff", "#ffffff", "#111827", "#e5e7eb", "#d87943"],
    ),
    make(
      [
        "#121113",
        "#c1c1c1",
        "#121212",
        "#c1c1c1",
        "#121113",
        "#c1c1c1",
        "#e78a53",
        "#121113",
        "#5f8787",
        "#121113",
        "#222222",
        "#888888",
        "#333333",
        "#c1c1c1",
        "#5f8787",
        "#121113",
        "#222222",
        "#222222",
        "#e78a53",
      ],
      ["#5f8787", "#e78a53", "#fbcb97", "#888888", "#999999"],
      ["#121212", "#c1c1c1", "#e78a53", "#121113", "#333333", "#c1c1c1", "#222222", "#e78a53"],
    ),
  ),

  openclaw: theme(
    "openclaw",
    "OpenClaw",
    "Dark-first, precise and warm",
    ["#1a1a1a", "#e03e3e", "#f27a3a", "#f5f0eb"],
    make(
      [
        "#fafafa",
        "#1a1a1a",
        "#f5f0eb",
        "#1a1a1a",
        "#ffffff",
        "#1a1a1a",
        "#e03e3e",
        "#ffffff",
        "#f5f0eb",
        "#1a1a1a",
        "#f5f0eb",
        "#6b7280",
        "#f27a3a",
        "#1a1a1a",
        "#ef4444",
        "#ffffff",
        "#d1d5db",
        "#d1d5db",
        "#e03e3e",
      ],
      ["#e03e3e", "#f27a3a", "#22c55e", "#3b82f6", "#a855f7"],
      ["#f5f0eb", "#1a1a1a", "#e03e3e", "#ffffff", "#e8e0da", "#1a1a1a", "#d1d5db", "#e03e3e"],
    ),
    make(
      [
        "#1a1a1a",
        "#f5f0eb",
        "#2a2a2a",
        "#f5f0eb",
        "#2a2a2a",
        "#f5f0eb",
        "#e03e3e",
        "#ffffff",
        "#3d3d3d",
        "#f5f0eb",
        "#3d3d3d",
        "#9ca3af",
        "#f27a3a",
        "#1a1a1a",
        "#ef4444",
        "#ffffff",
        "#3d3d3d",
        "#3d3d3d",
        "#e03e3e",
      ],
      ["#e03e3e", "#f27a3a", "#22c55e", "#3b82f6", "#a855f7"],
      ["#0d0d0d", "#f5f0eb", "#e03e3e", "#ffffff", "#2a2a2a", "#f5f0eb", "#3d3d3d", "#e03e3e"],
    ),
  ),

  whatsapp: theme(
    "whatsapp",
    "WhatsApp",
    "Warm professional green",
    ["#f7faf8", "#128c7e", "#25d366", "#075e54"],
    make(
      [
        "#f7faf8",
        "#111b21",
        "#ffffff",
        "#111b21",
        "#ffffff",
        "#111b21",
        "#128c7e",
        "#ffffff",
        "#e7f5ef",
        "#0b5f55",
        "#edf7f2",
        "#667781",
        "#d9fdd3",
        "#111b21",
        "#ea4335",
        "#ffffff",
        "#d1d7db",
        "#d1d7db",
        "#128c7e",
      ],
      ["#128c7e", "#25d366", "#075e54", "#34b7f1", "#8696a0"],
      ["#075e54", "#ffffff", "#25d366", "#ffffff", "#128c7e", "#ffffff", "#d1d7db", "#25d366"],
    ),
    make(
      [
        "#0b141a",
        "#e9edef",
        "#202c33",
        "#e9edef",
        "#202c33",
        "#e9edef",
        "#00a884",
        "#ffffff",
        "#2a3942",
        "#e9edef",
        "#2a3942",
        "#8696a0",
        "#005c4b",
        "#e9edef",
        "#f15c6d",
        "#ffffff",
        "#374045",
        "#374045",
        "#00a884",
      ],
      ["#00a884", "#25d366", "#53bdeb", "#8696a0", "#f15c6d"],
      ["#111b21", "#e9edef", "#00a884", "#ffffff", "#202c33", "#e9edef", "#374045", "#00a884"],
    ),
  ),
};

export const DEFAULT_THEME: ThemeKey = "burgundy";
export const DEFAULT_MODE: ThemeMode = "light";

export function resolveThemeKey(value?: string | null): ThemeKey {
  return value && value in THEMES ? (value as ThemeKey) : DEFAULT_THEME;
}

export function getThemeStorageKey() {
  return "stratus-theme";
}

export function getModeStorageKey() {
  return "stratus-theme-mode";
}

export function getInitialTheme() {
  return typeof window === "undefined"
    ? DEFAULT_THEME
    : resolveThemeKey(window.localStorage.getItem(getThemeStorageKey()));
}

export function getInitialMode(): ThemeMode {
  return typeof window === "undefined"
    ? DEFAULT_MODE
    : window.localStorage.getItem(getModeStorageKey()) === "dark"
      ? "dark"
      : DEFAULT_MODE;
}

export function applyTheme(themeKey?: string | null, _scope?: unknown, mode: ThemeMode = getInitialMode()) {
  const key = resolveThemeKey(themeKey);

  if (typeof document !== "undefined") {
    const root = document.documentElement;

    root.dataset.theme = key;
    root.dataset.mode = mode;
    root.classList.toggle("dark", mode === "dark");

    for (const [name, value] of Object.entries(THEMES[key][mode])) {
      root.style.setProperty(name, value);
    }
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(getThemeStorageKey(), key);

    window.localStorage.setItem(getModeStorageKey(), mode);
  }

  return key;
}

export interface ThemeContextValue {
  theme: ThemeKey;
  mode: ThemeMode;
  setTheme: (theme: ThemeKey) => void;
  setMode: (mode: ThemeMode) => void;
  themes: typeof THEMES;
}

export const ThemeContext = createStableContext<ThemeContextValue | null>("theme", null);

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}

export type BusinessType = "general" | "minimart" | "liquor_store" | "pharmacy" | "clothing";

export const BUSINESS_TYPE_OPTIONS: {
  value: BusinessType;
  label: string;
}[] = [
  {
    value: "general",
    label: "General / Other",
  },
  {
    value: "minimart",
    label: "Minimart",
  },
  {
    value: "liquor_store",
    label: "Liquor Store",
  },
  {
    value: "pharmacy",
    label: "Pharmacy",
  },
  {
    value: "clothing",
    label: "Clothing & Apparel",
  },
];
