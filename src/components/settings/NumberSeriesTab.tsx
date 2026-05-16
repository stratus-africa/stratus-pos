import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { Save, Hash, Receipt, CreditCard, FileText } from "lucide-react";
import { getSeries, setSeries, formatNumber, type NumberSeriesConfig, type SeriesKey } from "@/lib/numberSeries";

const SERIES: { key: SeriesKey; title: string; description: string; icon: React.ReactNode }[] = [
  { key: "receipts", title: "Receipts / Sales Invoices", description: "Used for receipts printed at the point of sale.", icon: <Receipt className="h-4 w-4" /> },
  { key: "expenses", title: "Expenses", description: "Default reference number for new expense records.", icon: <CreditCard className="h-4 w-4" /> },
  { key: "purchase_orders", title: "Purchase Orders", description: "Reference numbers for purchase order records.", icon: <FileText className="h-4 w-4" /> },
];

function SeriesEditor({ businessId, k }: { businessId: string; k: SeriesKey }) {
  const series = SERIES.find((s) => s.key === k)!;
  const [cfg, setCfg] = useState<NumberSeriesConfig>(getSeries(businessId, k));

  useEffect(() => { setCfg(getSeries(businessId, k)); }, [businessId, k]);

  const handleSave = () => {
    setSeries(businessId, k, { ...cfg, padding: Math.max(1, cfg.padding), next: Math.max(1, cfg.next) });
    toast.success(`${series.title} numbering saved`);
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Hash className="h-4 w-4" /> {series.title}</h3>
          <p className="text-sm text-muted-foreground">{series.description}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
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

  const [activeTab, setActiveTab] = useState<SeriesKey>("receipts");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Document Numbering</h2>
        <p className="text-sm text-muted-foreground">Define the prefix, padding and next number for your records. New documents will automatically use the next available number.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SeriesKey)} className="flex flex-col md:flex-row gap-4 md:gap-6">
        <TabsList className="text-muted-foreground flex md:flex-col h-auto w-full md:w-52 bg-muted rounded-lg p-1.5 shrink-0 md:items-start md:justify-start overflow-x-auto md:overflow-visible flex-nowrap">
          {SERIES.map((s) => (
            <TabsTrigger key={s.key} value={s.key} className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              {s.icon}{s.title}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 min-w-0">
          {SERIES.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-0">
              <SeriesEditor businessId={business.id} k={s.key} />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
