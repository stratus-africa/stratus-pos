import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { Save, Hash } from "lucide-react";
import { getSeries, setSeries, formatNumber, type NumberSeriesConfig, type SeriesKey } from "@/lib/numberSeries";

const SERIES: { key: SeriesKey; title: string; description: string }[] = [
  { key: "receipts", title: "Receipts / Sales Invoices", description: "Used for receipts printed at the point of sale." },
  { key: "expenses", title: "Expenses", description: "Default reference number for new expense records." },
];

function SeriesEditor({ businessId, k, title, description }: { businessId: string; k: SeriesKey; title: string; description: string }) {
  const [cfg, setCfg] = useState<NumberSeriesConfig>(getSeries(businessId, k));

  useEffect(() => { setCfg(getSeries(businessId, k)); }, [businessId, k]);

  const handleSave = () => {
    setSeries(businessId, k, { ...cfg, padding: Math.max(1, cfg.padding), next: Math.max(1, cfg.next) });
    toast.success(`${title} numbering saved`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Hash className="h-4 w-4" /> {title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Prefix</Label>
            <Input value={cfg.prefix} onChange={(e) => setCfg({ ...cfg, prefix: e.target.value })} placeholder="INV-" />
          </div>
          <div className="space-y-2">
            <Label>Padding (digits)</Label>
            <Input type="number" min={1} max={12} value={cfg.padding}
              onChange={(e) => setCfg({ ...cfg, padding: parseInt(e.target.value) || 1 })} />
          </div>
          <div className="space-y-2">
            <Label>Next Number</Label>
            <Input type="number" min={1} value={cfg.next}
              onChange={(e) => setCfg({ ...cfg, next: parseInt(e.target.value) || 1 })} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Next will look like:</span>
          <code className="text-sm font-mono">{formatNumber(cfg)}</code>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" /> Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function NumberSeriesTab() {
  const { business } = useBusiness();
  if (!business) return null;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Document Numbering</h2>
        <p className="text-sm text-muted-foreground">Define the prefix, padding and next number for your records. New documents will automatically use the next available number.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {SERIES.map((s) => (
          <SeriesEditor key={s.key} businessId={business.id} k={s.key} title={s.title} description={s.description} />
        ))}
      </div>
    </div>
  );
}
