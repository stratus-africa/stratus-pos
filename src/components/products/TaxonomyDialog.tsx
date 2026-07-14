import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TaxonomyValue {
  name: string;
  abbreviation?: string | null;
  color_code?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: TaxonomyValue) => void;
  title: string;
  label: string;
  initial?: TaxonomyValue | null;
  withAbbreviation?: boolean;
  withColor?: boolean;
  isLoading?: boolean;
}

const PRESET_COLORS = ["#0a6d4e", "#2563eb", "#dc2626", "#ea580c", "#ca8a04", "#7c3aed", "#0891b2", "#4b5563"];

export function TaxonomyDialog({ open, onOpenChange, onSubmit, title, label, initial, withAbbreviation, withColor, isLoading }: Props) {
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [color, setColor] = useState<string>("");

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setAbbr(initial?.abbreviation || "");
      setColor(initial?.color_code || "");
    }
  }, [open, initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      abbreviation: withAbbreviation ? (abbr.trim() || null) : undefined,
      color_code: withColor ? (color || null) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{label}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          {withAbbreviation && (
            <div className="space-y-2">
              <Label>Abbreviation (optional)</Label>
              <Input value={abbr} onChange={(e) => setAbbr(e.target.value)} placeholder="e.g. pcs" />
            </div>
          )}
          {withColor && (
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
                <input type="color" value={color || "#0a6d4e"} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 rounded border" />
                {color && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setColor("")}>Clear</Button>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>{initial ? "Update" : "Add"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
