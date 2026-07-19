import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2, Building2, Phone, Mail, MapPin, PackageOpen, Briefcase, ShoppingCart, Bell, Percent } from "lucide-react";
import { THEMES, DEFAULT_THEME, applyTheme, type ThemeKey, BUSINESS_TYPE_OPTIONS, type BusinessType } from "@/lib/themes";

export function BusinessProfileTab() {
  const { business, refreshBusiness } = useBusiness();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(business?.name || "");
  const [phone, setPhone] = useState((business as any)?.phone || "");
  const [email, setEmail] = useState((business as any)?.email || "");
  const [address, setAddress] = useState((business as any)?.address || "");
  const [themeColor, setThemeColor] = useState<ThemeKey>(((business as { theme_color?: ThemeKey })?.theme_color || DEFAULT_THEME) as ThemeKey);
  const [preventOverselling, setPreventOverselling] = useState((business as { prevent_overselling?: boolean })?.prevent_overselling ?? false);
  const [requireManagerToRemove, setRequireManagerToRemove] = useState((business as { pos_require_manager_to_remove_item?: boolean })?.pos_require_manager_to_remove_item ?? false);
  const [managerApproverId, setManagerApproverId] = useState<string>(((business as any)?.pos_manager_approver_id) || "any");
  const [businessType, setBusinessType] = useState<BusinessType>(((business as { business_type?: BusinessType })?.business_type || "general") as BusinessType);
  const [trackBatches, setTrackBatches] = useState<boolean>((business as { track_batches?: boolean })?.track_batches ?? false);
  const [posShowStockQty, setPosShowStockQty] = useState<boolean>((business as { pos_show_stock_qty?: boolean })?.pos_show_stock_qty ?? true);
  const [posHideZeroStock, setPosHideZeroStock] = useState<boolean>((business as { pos_hide_zero_stock?: boolean })?.pos_hide_zero_stock ?? true);
  const [remindUnpaidPurchases, setRemindUnpaidPurchases] = useState<boolean>((business as { reminders_unpaid_purchases?: boolean })?.reminders_unpaid_purchases ?? false);
  const [remindUnpostedExpenses, setRemindUnpostedExpenses] = useState<boolean>((business as { reminders_unposted_expenses?: boolean })?.reminders_unposted_expenses ?? false);
  const [vatEnabled, setVatEnabled] = useState<boolean>((business as { vat_enabled?: boolean })?.vat_enabled ?? true);
  const [kraPin, setKraPin] = useState<string>((business as { kra_pin?: string })?.kra_pin || "");
  const [managers, setManagers] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [negativeStockCount, setNegativeStockCount] = useState<number>(0);

  useEffect(() => {
    if (!business) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("business_id", business.id)
        .in("role", ["admin", "manager"] as any);
      const ids = (roles || []).map((r) => r.user_id);
      if (ids.length === 0) { setManagers([]); }
      else {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        setManagers((profs || []).map((p) => ({ user_id: p.id, full_name: p.full_name, email: p.email })));
      }
      const { count } = await supabase
        .from("inventory")
        .select("id, locations!inner(business_id)", { count: "exact", head: true })
        .eq("locations.business_id", business.id)
        .lt("quantity", 0);
      setNegativeStockCount(count ?? 0);
    })();
  }, [business?.id]);

  const handleSave = async () => {
    if (!business) return;
    if (vatEnabled && !kraPin.trim()) {
      toast.error("KRA PIN is required when VAT is enabled");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        theme_color: themeColor,
        prevent_overselling: preventOverselling,
        pos_require_manager_to_remove_item: requireManagerToRemove,
        pos_manager_approver_id: managerApproverId === "any" ? null : managerApproverId,
        business_type: businessType,
        track_batches: businessType === "pharmacy" ? trackBatches : false,
        pos_show_stock_qty: posShowStockQty,
        pos_hide_zero_stock: posHideZeroStock,
        reminders_unpaid_purchases: remindUnpaidPurchases,
        reminders_unposted_expenses: remindUnpostedExpenses,
      } as never)
      .eq("id", business.id);

    if (error) {
      toast.error("Failed to update business: " + error.message);
    } else {
      applyTheme(themeColor);
      toast.success("Business profile updated");
      await refreshBusiness();
    }
    setSaving(false);
  };

  if (!business) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2 items-start">
      {/* General Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Information
          </CardTitle>
          <CardDescription>Core business details and branding.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="biz-name">Business Name</Label>
              <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="biz-phone" className="pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="biz-email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@business.co.ke" />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="biz-address">Business Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea id="biz-address" className="pl-9 min-h-[60px]" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, Building, City" />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Industry</Label>
              <Select value={businessType} onValueChange={(v) => setBusinessType(v as BusinessType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Industry helps us tailor features. Pharmacy unlocks batch & expiry tracking.</p>
            </div>
            {businessType === "pharmacy" && (
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-base">Enable Batch Tracking</Label>
                  <p className="text-sm text-muted-foreground">Track batch numbers and expiry dates on products and inventory.</p>
                </div>
                <Switch checked={trackBatches} onCheckedChange={setTrackBatches} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Business Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5" />
            Business Rules
          </CardTitle>
          <CardDescription>Inventory and point of sale safeguards.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Prevent overselling</Label>
              <p className="text-sm text-muted-foreground">Block sales and adjustments that would push stock below zero.</p>
              {negativeStockCount > 0 && !preventOverselling && (
                <p className="text-xs text-destructive mt-1">
                  Cannot enable — {negativeStockCount} product{negativeStockCount > 1 ? "s have" : " has"} negative stock. Reconcile inventory to 0 or above first.
                </p>
              )}
            </div>
            <Switch
              checked={preventOverselling}
              disabled={!preventOverselling && negativeStockCount > 0}
              onCheckedChange={(v) => {
                if (v && negativeStockCount > 0) {
                  toast.error(`Cannot enable: ${negativeStockCount} product(s) have negative stock. All stocks must be 0 or above.`);
                  return;
                }
                setPreventOverselling(v);
              }}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Require manager approval to remove a scanned item</Label>
              <p className="text-sm text-muted-foreground">
                Cashiers must enter manager credentials before removing an item already added to the cart.
              </p>
            </div>
            <Switch checked={requireManagerToRemove} onCheckedChange={setRequireManagerToRemove} />
          </div>
          {requireManagerToRemove && (
            <div className="space-y-2 pt-2 border-t">
              <Label>Approving Manager</Label>
              <Select value={managerApproverId} onValueChange={setManagerApproverId}>
                <SelectTrigger><SelectValue placeholder="Any admin or manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any admin or manager</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email || "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                If set, only this specific user can approve POS item removal. Otherwise any admin or manager can approve.
              </p>
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Show stock quantity on POS</Label>
              <p className="text-sm text-muted-foreground">
                Display the available quantity badge next to each product in the POS product listing. Turn off to hide stock quantities from cashiers.
              </p>
            </div>
            <Switch checked={posShowStockQty} onCheckedChange={setPosShowStockQty} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Hide zero / negative stock from POS</Label>
              <p className="text-sm text-muted-foreground">
                Products with quantity of zero or below at the current location won't appear in the POS product list. Turn off to show every active product regardless of stock.
              </p>
            </div>
            <Switch checked={posHideZeroStock} onCheckedChange={setPosHideZeroStock} />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Choose the daily reminders you'd like to see on the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Reminder: Settle unpaid purchases</Label>
              <p className="text-sm text-muted-foreground">
                Show a banner when there are supplier invoices still unpaid or partially paid.
              </p>
            </div>
            <Switch checked={remindUnpaidPurchases} onCheckedChange={setRemindUnpaidPurchases} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Reminder: Post expenses</Label>
              <p className="text-sm text-muted-foreground">
                Show a banner when there are recent expenses without a category assigned.
              </p>
            </div>
            <Switch checked={remindUnpostedExpenses} onCheckedChange={setRemindUnpostedExpenses} />
          </div>
        </CardContent>
      </Card>
      </div>


      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
