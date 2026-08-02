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
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
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
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const searchRef = useRef(searchInputRef);
  searchRef.current = searchInputRef;

  useEffect(() => {
    if (disabled) return;
    let buffer = "";
    let lastTime = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    // Keys we swallowed for the current buffer, so a partial scan never leaks.
    let suppressing = false;

    const clearTimer = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const reset = () => {
      buffer = "";
      suppressing = false;
      clearTimer();
    };

    const emit = () => {
      const code = buffer;
      const min = settingsRef.current.minLength;
      reset();
      if (code.length >= min) onScanRef.current(code);
    };

    const scheduleFlush = () => {
      if (settingsRef.current.enterHandling === "required") return;
      clearTimer();
      flushTimer = setTimeout(emit, settingsRef.current.idleFlush);
    };

    const onKey = (e: KeyboardEvent) => {
      const s = settingsRef.current;
      const now = performance.now();
      const gap = now - lastTime;
      lastTime = now;

      const target = e.target as HTMLElement | null;
      const isSearchInput = !!searchRef.current?.current && target === searchRef.current.current;
      const typingElsewhere =
        !isSearchInput &&
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Enter") {
        if (s.enterHandling !== "ignore" && buffer.length >= s.minLength) {
          e.preventDefault();
          e.stopPropagation();
          emit();
          return;
        }
        reset();
        return;
      }

      // Only printable single characters are part of a barcode.
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) {
        reset();
        return;
      }

      // Slow (human) typing restarts the buffer.
      if (gap > s.maxInterval) {
        buffer = "";
        suppressing = false;
      }
      buffer += e.key;
      scheduleFlush();

      // Suppress scan keystrokes that would otherwise pollute an unrelated field.
      if (typingElsewhere && (suppressing || buffer.length >= 2)) {
        suppressing = true;
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Capture phase on the document keeps the listener working no matter what
    // is focused (cart inputs, dialogs, buttons) while the screen is mounted.
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimer();
      document.removeEventListener("keydown", onKey, true);
    };
  }, [disabled]);
}

