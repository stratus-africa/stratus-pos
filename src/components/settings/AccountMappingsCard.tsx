import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Sparkles } from "lucide-react";
import { ACCOUNT_MAPPING_KEYS, useAccountMappings } from "@/hooks/useAccountMappings";

export function AccountMappingsCard() {
  const { accounts, mappings, setMapping, seedDefaults, isConfigured } = useAccountMappings();
  const list = accounts.data || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Automatic Posting Accounts
          {isConfigured ? (
            <Badge variant="secondary" className="ml-1">Active</Badge>
          ) : (
            <Badge variant="outline" className="ml-1">Not set up</Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sales post to your income accounts, purchases marked received post to Cost of Goods Sold, and stock
          adjustments post to the Inventory Adjustments account. Entries reverse automatically when a document is
          cancelled or deleted.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.length === 0 && (
          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">No chart of accounts yet</p>
              <p className="text-xs text-muted-foreground">
                Create a standard set of accounts and map them in one click.
              </p>
            </div>
            <Button size="sm" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
              <Sparkles className="mr-2 h-4 w-4" /> Create default accounts
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {ACCOUNT_MAPPING_KEYS.map((m) => {
            const options = list.filter((a) => a.is_active && m.types.includes(a.type as never));
            return (
              <div key={m.key} className="space-y-1.5">
                <Label className="text-sm">{m.label}</Label>
                <Select
                  value={mappings.data?.[m.key] || ""}
                  onValueChange={(v) => setMapping.mutate({ key: m.key, accountId: v })}
                  disabled={options.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={options.length ? "Select account" : "No matching accounts"} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{m.help}</p>
              </div>
            );
          })}
        </div>

        {list.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
            <Sparkles className="mr-2 h-4 w-4" /> Add any missing default accounts
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default AccountMappingsCard;
