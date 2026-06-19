import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2, Plug, FileSpreadsheet } from "lucide-react";

export function IntegrationsTab() {
  const { business, refreshBusiness } = useBusiness();
  const [saving, setSaving] = useState(false);
  const [zohoReportsEnabled, setZohoReportsEnabled] = useState<boolean>(
    (business as { zoho_reports_enabled?: boolean })?.zoho_reports_enabled ?? false
  );

  useEffect(() => {
    setZohoReportsEnabled((business as { zoho_reports_enabled?: boolean })?.zoho_reports_enabled ?? false);
  }, [business?.id]);

  const handleSave = async () => {
    if (!business) return;
    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({ zoho_reports_enabled: zohoReportsEnabled } as never)
      .eq("id", business.id);
    if (error) toast.error("Failed to save: " + error.message);
    else {
      toast.success("Integration settings updated");
      await refreshBusiness();
    }
    setSaving(false);
  };

  if (!business) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Integrations
          </CardTitle>
          <CardDescription>
            Connect your business with external services and accounting tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-emerald-50 p-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">Zoho Reports</Label>
                    <Badge variant="outline" className="text-xs">Zoho Books</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    When enabled, the End of Day Reconciliation modal prompts cashiers to export
                    Invoice CSV and Payments CSV in Zoho Books-compatible format before closing the register.
                    Files can then be imported directly into Zoho Books.
                  </p>
                </div>
              </div>
              <Switch checked={zohoReportsEnabled} onCheckedChange={setZohoReportsEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
