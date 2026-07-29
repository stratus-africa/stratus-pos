import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Receipt } from "lucide-react";
import { useAccountingSettings, VAT_JOURNALS } from "@/hooks/useAccountingSettings";

/**
 * VAT posting is ON by default for every journal. Each switch turns it off for
 * a single journal only — the change saves immediately (one click).
 */
export function VatPostingCard() {
  const { save, settings } = useAccountingSettings();
  const vat = settings.vat_posting;
  const allOn = VAT_JOURNALS.every((j) => vat[j.key] !== false);

  const toggle = (key: keyof typeof vat, value: boolean) =>
    save.mutate({ vat_posting: { ...vat, [key]: value } });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4" /> VAT Posting
          <Badge variant={allOn ? "secondary" : "outline"} className="ml-1">
            {allOn ? "On for all journals" : "Disabled for some journals"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          VAT is posted to your VAT Payable account automatically. Switch it off for a specific journal to post the
          gross amount to the revenue or cost account instead.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {VAT_JOURNALS.map((j) => (
          <div
            key={j.key}
            className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium">{j.label}</p>
              <p className="text-xs text-muted-foreground">{j.help}</p>
            </div>
            <Switch
              checked={vat[j.key] !== false}
              disabled={save.isPending}
              onCheckedChange={(v) => toggle(j.key, v)}
              aria-label={`VAT posting for ${j.label}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default VatPostingCard;
