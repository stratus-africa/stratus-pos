import { useEffect, useRef, useState } from "react";
import {
  BarcodeScanSettings,
  loadScanSettings,
  fetchScanSettings,
} from "@/lib/barcodeScan";
import { useBusiness } from "@/contexts/BusinessContext";

/** Live copy of the scanner settings (tenant-wide, cached locally). */
export function useScanSettings(): BarcodeScanSettings {
  const { business } = useBusiness();
  const businessId = business?.id;
  const [settings, setSettings] = useState<BarcodeScanSettings>(() => loadScanSettings(businessId));

  useEffect(() => {
    const sync = () => setSettings(loadScanSettings(businessId));
    sync();
    window.addEventListener("barcode-scan-settings-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("barcode-scan-settings-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    fetchScanSettings(businessId)
      .then((s) => { if (!cancelled) setSettings(s); })
      .catch(() => { /* keep cached settings */ });
    return () => { cancelled = true; };
  }, [businessId]);

  return settings;
}


interface Options {
  /** Called with the complete, untruncated scanned code. */
  onScan: (code: string) => void;
  /** Disable the global listener (e.g. while the camera scanner modal is open). */
  disabled?: boolean;
  /** Element that is allowed to keep the keystrokes (the POS search input). */
  searchInputRef?: React.RefObject<HTMLInputElement>;
  settings: BarcodeScanSettings;
}

/**
 * Global keyboard-wedge barcode listener.
 *
 * Works regardless of focus: rapid keystrokes are buffered, and the full code is
 * emitted on Enter (or after an idle flush when Enter handling is not required).
 * Keys belonging to a detected scan are suppressed so they never leak into
 * whatever field happens to be focused.
 */
export function useBarcodeScanner({ onScan, disabled, searchInputRef, settings }: Options) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (disabled) return;
    let buffer = "";
    let lastTime = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const emit = () => {
      const code = buffer;
      buffer = "";
      clearTimer();
      if (code.length >= settings.minLength) onScanRef.current(code);
    };

    const scheduleFlush = () => {
      if (settings.enterHandling === "required") return;
      clearTimer();
      flushTimer = setTimeout(emit, settings.idleFlush);
    };

    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      const gap = now - lastTime;
      lastTime = now;

      const target = e.target as HTMLElement | null;
      const isSearchInput = !!searchInputRef?.current && target === searchInputRef.current;
      const typingElsewhere =
        !isSearchInput &&
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Enter") {
        if (settings.enterHandling !== "ignore" && buffer.length >= settings.minLength) {
          e.preventDefault();
          e.stopPropagation();
          emit();
          return;
        }
        buffer = "";
        clearTimer();
        return;
      }

      // Only printable single characters are part of a barcode.
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) {
        buffer = "";
        clearTimer();
        return;
      }

      // Slow (human) typing restarts the buffer.
      if (gap > settings.maxInterval) buffer = "";
      buffer += e.key;
      scheduleFlush();

      // Suppress scan keystrokes that would otherwise pollute an unrelated field.
      if (typingElsewhere && buffer.length >= 2) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimer();
      window.removeEventListener("keydown", onKey, true);
    };
  }, [disabled, settings, searchInputRef]);
}
