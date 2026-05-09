import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import { Save, Loader2, Eye } from "lucide-react";

interface ReceiptConfig {
  header: string;
  footer: string;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showTaxBreakdown: boolean;
  thankYouMessage: string;
}

const defaultConfig: ReceiptConfig = {
  header: "",
  footer: "",
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showTaxBreakdown: true,
  thankYouMessage: "Thank you for your purchase!",
};

export function ReceiptSettingsTab() {
  const { business } = useBusiness();
  const [config, setConfig] = useState<ReceiptConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`receipt_config_${business?.id}`);
    if (saved) {
      try {
        setConfig({ ...defaultConfig, ...JSON.parse(saved) });
      } catch {}
    }
  }, [business?.id]);

  const handleSave = () => {
    if (!business) return;
    setSaving(true);
    localStorage.setItem(`receipt_config_${business.id}`, JSON.stringify(config));
    setTimeout(() => {
      setSaving(false);
      toast.success("Receipt template saved");
    }, 300);
  };

  const update = (key: keyof ReceiptConfig, value: any) => setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Receipt Template</CardTitle>
          <CardDescription>Customize how your receipts look when printed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Header Text</Label>
            <Input
              value={config.header}
              onChange={(e) => update("header", e.target.value)}
              placeholder={business?.name || "Business Name"}
            />
            <p className="text-xs text-muted-foreground">Appears at the top of every receipt.</p>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Display Options</Label>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show business address</Label>
              <Switch checked={config.showAddress} onCheckedChange={(v) => update("showAddress", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show phone number</Label>
              <Switch checked={config.showPhone} onCheckedChange={(v) => update("showPhone", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Show tax breakdown</Label>
              <Switch checked={config.showTaxBreakdown} onCheckedChange={(v) => update("showTaxBreakdown", v)} />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Thank You Message</Label>
            <Input
              value={config.thankYouMessage}
              onChange={(e) => update("thankYouMessage", e.target.value)}
              placeholder="Thank you for your purchase!"
            />
          </div>

          <div className="space-y-2">
            <Label>Footer Text</Label>
            <Textarea
              value={config.footer}
              onChange={(e) => update("footer", e.target.value)}
              placeholder="Return policy, contact info, etc."
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="mr-1 h-4 w-4" /> {showPreview ? "Hide" : "Show"} Preview
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {showPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Receipt Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md p-4 font-mono text-xs leading-relaxed bg-muted/30 max-w-[300px] mx-auto">
              <div className="text-center space-y-0.5">
                <p className="font-bold text-sm">{config.header || business?.name}</p>
                {config.showAddress && <p className="text-muted-foreground">123 Sample Street</p>}
                {config.showPhone && <p className="text-muted-foreground">+254 700 000 000</p>}
              </div>
              <div className="border-t border-dashed my-2" />
              <p className="text-muted-foreground">INV-00001 • {new Date().toLocaleDateString()}</p>
              <div className="border-t border-dashed my-2" />
              <div className="flex justify-between"><span>Sample Product x2</span><span>500.00</span></div>
              <div className="flex justify-between"><span>Another Item x1</span><span>250.00</span></div>
              <div className="border-t border-dashed my-2" />
              <div className="flex justify-between"><span>Subtotal</span><span>750.00</span></div>
              {config.showTaxBreakdown && (
                <div className="flex justify-between text-muted-foreground"><span>VAT (16%)</span><span>120.00</span></div>
              )}
              <div className="flex justify-between font-bold"><span>Total</span><span>{business?.currency || "KES"} 870.00</span></div>
              <div className="border-t border-dashed my-2" />
              <div className="flex justify-between"><span>Cash</span><span>1,000.00</span></div>
              <div className="flex justify-between"><span>Change</span><span>130.00</span></div>
              <div className="border-t border-dashed my-2" />
              <p className="text-center text-muted-foreground">{config.thankYouMessage}</p>
              {config.footer && <p className="text-center text-muted-foreground mt-1">{config.footer}</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
