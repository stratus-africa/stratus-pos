import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { financialYearRange } from "@/hooks/useAccountingSettings";

export type DatePresetKey =
  | "today"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "yesterday"
  | "previous_week"
  | "previous_month"
  | "previous_quarter"
  | "previous_year"
  | "this_financial_year"
  | "last_financial_year"
  | "custom";

export const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "this_quarter", label: "This Quarter" },
  { key: "this_year", label: "This Year" },
  { key: "yesterday", label: "Yesterday" },
  { key: "previous_week", label: "Previous Week" },
  { key: "previous_month", label: "Previous Month" },
  { key: "previous_quarter", label: "Previous Quarter" },
  { key: "previous_year", label: "Previous Year" },
  { key: "this_financial_year", label: "This Financial Year" },
  { key: "last_financial_year", label: "Last Financial Year" },
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
export function resolvePreset(key: DatePresetKey, fyStartMonth = 1): { from: string; to: string } | null {
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
    case "previous_week": {
      const s = startOfWeek(now);
      s.setDate(s.getDate() - 7);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      return { from: isoDate(s), to: isoDate(e) };
    }
    case "this_month":
      return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
    case "previous_month":
      return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: isoDate(new Date(y, q, 1)), to: isoDate(new Date(y, q + 3, 0)) };
    }
    case "previous_quarter": {
      const q = Math.floor(m / 3) * 3 - 3;
      return { from: isoDate(new Date(y, q, 1)), to: isoDate(new Date(y, q + 3, 0)) };
    }
    case "this_year":
      return { from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, 11, 31)) };
    case "previous_year":
      return { from: isoDate(new Date(y - 1, 0, 1)), to: isoDate(new Date(y - 1, 11, 31)) };
    case "this_financial_year": {
      const { start, end } = financialYearRange(fyStartMonth, now);
      return { from: isoDate(start), to: isoDate(end) };
    }
    case "last_financial_year": {
      const ref = new Date(now);
      ref.setFullYear(ref.getFullYear() - 1);
      const { start, end } = financialYearRange(fyStartMonth, ref);
      return { from: isoDate(start), to: isoDate(end) };
    }
    default:
      return null;
  }
}

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Financial-year start month (1-12) for the financial year presets. */
  fyStartMonth?: number;
  /** Initial preset selection. Defaults to "custom" so existing values are kept. */
  defaultPreset?: DatePresetKey;
  className?: string;
}

/**
 * Shared "As of" date range filter used across all reports. Presets set the
 * range automatically; "Custom" reveals From/To inputs for a manual range.
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  fyStartMonth = 1,
  defaultPreset = "custom",
  className,
}: DateRangeFilterProps) {
  const [preset, setPreset] = useState<DatePresetKey>(defaultPreset);

  // Apply the initial preset once (skipped for "custom").
  useEffect(() => {
    const range = resolvePreset(defaultPreset, fyStartMonth);
    if (range) onChange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreset = (value: string) => {
    const key = value as DatePresetKey;
    setPreset(key);
    const range = resolvePreset(key, fyStartMonth);
    if (range) onChange(range);
  };

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className ?? ""}`}>
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </Label>
        <Select value={preset} onValueChange={handlePreset}>
          <SelectTrigger className="w-[210px]">
            <span className="text-muted-foreground mr-1 shrink-0">As of :</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {DATE_PRESETS.filter((p) => p.key !== "custom").map((p) => (
              <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
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
            <Input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} className="w-40" />
          </div>
        </>
      )}

      {preset !== "custom" && (from || to) && (
        <span className="text-xs text-muted-foreground pb-2.5">{from} → {to}</span>
      )}
    </div>
  );
}

export default DateRangeFilter;
