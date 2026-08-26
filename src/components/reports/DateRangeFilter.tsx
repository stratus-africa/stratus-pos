import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DatePresetKey = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "this_year" | "custom";

export const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "this_month", label: "This Month" },
  { key: "this_year", label: "This Year" },
  { key: "custom", label: "Custom" },
];

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday-based
  x.setDate(x.getDate() - day);
  return x;
};

/** Resolves a preset key into an inclusive { from, to } ISO date range. */
export function resolvePreset(key: DatePresetKey): { from: string; to: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case "today":
      return { from: isoDate(now), to: isoDate(now) };
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { from: isoDate(d), to: isoDate(d) };
    }
    case "this_week": {
      const s = startOfWeek(now);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return { from: isoDate(s), to: isoDate(e) };
    }
    case "last_week": {
      const s = startOfWeek(now);
      s.setDate(s.getDate() - 7);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return { from: isoDate(s), to: isoDate(e) };
    }
    case "this_month":
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case "this_year":
      return { from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, 11, 31)) };
    default:
      return null;
  }
}

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Initial preset selection. Defaults to "custom" so existing values are kept. */
  defaultPreset?: DatePresetKey;
  className?: string;
  /** Optional range/as-of mode toggle shown when onModeChange is provided. */
  mode?: "as_of" | "range";
  onModeChange?: (mode: "as_of" | "range") => void;
}

/**
 * Shared "As of" date range filter used across all reports. Presets set the
 * range automatically; "Custom" reveals From/To inputs for a manual range.
 */
export function DateRangeFilter({ from, to, onChange, defaultPreset = "custom", className, mode, onModeChange }: DateRangeFilterProps) {
  const [preset, setPreset] = useState<DatePresetKey>(defaultPreset);

  // Apply the initial preset once when no range is set yet (skipped for "custom").
  useEffect(() => {
    if (from || to) return;
    const range = resolvePreset(defaultPreset);
    if (range) onChange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep preset dropdown in sync when from/to are controlled externally.
  useEffect(() => {
    if (!from && !to) return;
    for (const p of DATE_PRESETS) {
      if (p.key === "custom") continue;
      const range = resolvePreset(p.key);
      if (range?.from === from && range?.to === to) {
        setPreset(p.key);
        return;
      }
    }
    setPreset("custom");
  }, [from, to]);

  const handlePreset = (value: string) => {
    const key = value as DatePresetKey;
    setPreset(key);
    const range = resolvePreset(key);
    if (range) onChange(range);
  };

  return (
    <div className={`grid w-full grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap sm:gap-3 ${className ?? ""}`}>
      {onModeChange && (
        <div className="space-y-1.5">
          <Label className="text-xs">Mode</Label>
          <Select value={mode ?? "range"} onValueChange={(v) => onModeChange(v as "as_of" | "range")}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="range">Date Range</SelectItem>
              <SelectItem value="as_of">As of Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="col-span-2 space-y-1.5 sm:col-span-auto">
        <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </Label>
        <Select value={preset} onValueChange={handlePreset}>
          <SelectTrigger className="w-full sm:w-[210px]">
            <span className="text-muted-foreground mr-1 shrink-0">As of :</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {DATE_PRESETS.filter((p) => p.key !== "custom").map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => onChange({ from: e.target.value, to })}
              className="w-full sm:w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => onChange({ from, to: e.target.value })}
              className="w-full sm:w-40"
            />
          </div>
        </>
      )}

      {preset !== "custom" && (from || to) && (
        <span className="col-span-2 text-xs text-muted-foreground pb-1 sm:col-span-auto sm:pb-2.5">
          {from} → {to}
        </span>
      )}
    </div>
  );
}

export default DateRangeFilter;
