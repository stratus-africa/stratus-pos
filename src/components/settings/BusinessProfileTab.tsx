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
import { Save, Loader2, Building2, Phone, Mail, MapPin, FileText, UserCheck, Palette, PackageOpen, Briefcase, ShoppingCart } from "lucide-react";
import { THEMES, DEFAULT_THEME, applyTheme, type ThemeKey, BUSINESS_TYPE_OPTIONS, type BusinessType } from "@/lib/themes";

export function BusinessProfileTab() {
  const { business, refreshBusiness } = useBusiness();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(business?.name || "");
  const [currency, setCurrency] = useState(business?.currency || "KES");
  const [taxRate, setTaxRate] = useState(String(business?.tax_rate ?? 16));
  const [timezone, setTimezone] = useState(business?.timezone || "Africa/Nairobi");
  const [phone, setPhone] = useState((business as any)?.phone || "");
  const [email, setEmail] = useState((business as any)?.email || "");
  const [address, setAddress] = useState((business as any)?.address || "");
  const [kraPin, setKraPin] = useState((business as any)?.kra_pin || "");
  const [vatEnabled, setVatEnabled] = useState((business as { vat_enabled?: boolean })?.vat_enabled ?? true);
  const [accountantName, setAccountantName] = useState((business as { accountant_name?: string })?.accountant_name || "");
  const [accountantEmail, setAccountantEmail] = useState((business as { accountant_email?: string })?.accountant_email || "");
  const [accountantPhone, setAccountantPhone] = useState((business as { accountant_phone?: string })?.accountant_phone || "");
  const [themeColor, setThemeColor] = useState<ThemeKey>(((business as { theme_color?: ThemeKey })?.theme_color || DEFAULT_THEME) as ThemeKey);
  const [preventOverselling, setPreventOverselling] = useState((business as { prevent_overselling?: boolean })?.prevent_overselling ?? false);
  const [requireManagerToRemove, setRequireManagerToRemove] = useState((business as { pos_require_manager_to_remove_item?: boolean })?.pos_require_manager_to_remove_item ?? false);
  const [managerApproverId, setManagerApproverId] = useState<string>(((business as any)?.pos_manager_approver_id) || "any");
  const [businessType, setBusinessType] = useState<BusinessType>(((business as { business_type?: BusinessType })?.business_type || "general") as BusinessType);
  const [managers, setManagers] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);

  useEffect(() => {
    if (!business) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("business_id", business.id)
        .in("role", ["admin", "manager"] as any);
      const ids = (roles || []).map((r) => r.user_id);
      if (ids.length === 0) { setManagers([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      setManagers((profs || []).map((p) => ({ user_id: p.id, full_name: p.full_name, email: p.email })));
    })();
  }, [business?.id]);

  const handleSave = async () => {
    if (!business) return;
    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        name: name.trim(),
        currency,
        tax_rate: parseFloat(taxRate) || 0,
        timezone,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        kra_pin: kraPin.trim() || null,
        vat_enabled: vatEnabled,
        accountant_name: accountantName.trim() || null,
        accountant_email: accountantEmail.trim() || null,
        accountant_phone: accountantPhone.trim() || null,
        theme_color: themeColor,
        prevent_overselling: preventOverselling,
        pos_require_manager_to_remove_item: requireManagerToRemove,
        pos_manager_approver_id: managerApproverId === "any" ? null : managerApproverId,
        business_type: businessType,
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
          </div>
        </CardContent>
      </Card>

      {/* Business Type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Business Type
          </CardTitle>
          <CardDescription>
            Industry helps us tailor features. Pharmacy unlocks batch & expiry tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-sm">
            <Label>Industry</Label>
            <Select value={businessType} onValueChange={(v) => setBusinessType(v as BusinessType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tax & Regional */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Tax & Regional Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="biz-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="biz-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="UGX">UGX — Ugandan Shilling</SelectItem>
                  <SelectItem value="TZS">TZS — Tanzanian Shilling</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-tz">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="biz-tz"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT)</SelectItem>
                  <SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem>
                  <SelectItem value="Africa/Cairo">Africa/Cairo (EET)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">VAT Enabled</Label>
              <p className="text-sm text-muted-foreground">Enable or disable VAT charging for this organization</p>
            </div>
            <Switch checked={vatEnabled} onCheckedChange={setVatEnabled} />
          </div>

          {vatEnabled && (
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="biz-tax">Default Tax Rate (%)</Label>
              <Input
                id="biz-tax"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accountant */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Accountant
          </CardTitle>
          <CardDescription>Add your accountant's contact information for reference and reporting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Accountant Name</Label>
              <Input value={accountantName} onChange={(e) => setAccountantName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Accountant Email</Label>
              <Input value={accountantEmail} onChange={(e) => setAccountantEmail(e.target.value)} placeholder="accountant@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Accountant Phone</Label>
              <Input value={accountantPhone} onChange={(e) => setAccountantPhone(e.target.value)} placeholder="+254 7XX XXX XXX" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>Pick a brand color. Alternating table rows use a lighter shade of this color.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setThemeColor(t.key); applyTheme(t.key); }}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                  themeColor === t.key ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="h-8 w-8 rounded-full border" style={{ backgroundColor: t.swatch }} />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Inventory rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5" />
            Inventory Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Prevent overselling</Label>
              <p className="text-sm text-muted-foreground">Block sales and adjustments that would push stock below zero.</p>
            </div>
            <Switch checked={preventOverselling} onCheckedChange={setPreventOverselling} />
          </div>
        </CardContent>
      </Card>

      {/* POS rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Point of Sale Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Require manager approval to remove a scanned item</Label>
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
