/**
 * Configurable barcode scanner timing rules.
 * Persisted per-browser so each till can be tuned to its own scanner.
 */

export interface BarcodeScanSettings {
  /** Minimum number of characters before a burst is treated as a barcode. */
  minLength: number;
  /** Maximum milliseconds allowed between two keystrokes of the same scan. */
  maxInterval: number;
  /** How the end of a scan is detected. */
  enterHandling: "required" | "optional" | "ignore";
  /** When enterHandling !== "required", flush the buffer after this idle time (ms). */
  idleFlush: number;
  /** On no match, put the code in the product search box and focus it. */
  openSearchOnMiss: boolean;
}

export const DEFAULT_SCAN_SETTINGS: BarcodeScanSettings = {
  minLength: 4,
  maxInterval: 80,
  enterHandling: "optional",
  idleFlush: 220,
  openSearchOnMiss: true,
};

const KEY = "pos.barcodeScanSettings";

export function loadScanSettings(): BarcodeScanSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SCAN_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BarcodeScanSettings>;
    return { ...DEFAULT_SCAN_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SCAN_SETTINGS;
  }
}

export function saveScanSettings(s: BarcodeScanSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent("barcode-scan-settings-changed"));
  } catch {
    /* ignore */
  }
}
