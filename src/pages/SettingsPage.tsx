import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  MapPin,
  Users,
  Receipt,
  CreditCard,
  ShieldCheck,
  Wallet,
  Smartphone,
  Palette,
  Hash,
  Plug,
  FileCheck2,
  Printer,
  MonitorSmartphone,
  Calculator,
  DatabaseBackup,
} from "lucide-react";
import CustomerDisplayTab from "@/components/settings/CustomerDisplayTab";
import { BusinessProfileTab } from "@/components/settings/BusinessProfileTab";
import { BrandingTab } from "@/components/settings/BrandingTab";
import { LocationsTab } from "@/components/settings/LocationsTab";
import { UserManagementTab } from "@/components/settings/UserManagementTab";
import { ReceiptSettingsTab } from "@/components/settings/ReceiptSettingsTab";
import { PriceTagSettingsTab } from "@/components/settings/PriceTagSettingsTab";
import { SubscriptionTab } from "@/components/settings/SubscriptionTab";
import { RolesPermissionsTab } from "@/components/settings/RolesPermissionsTab";
import { PaymentAccountsTab } from "@/components/settings/PaymentAccountsTab";
import { PaymentGatewaysTab } from "@/components/settings/PaymentGatewaysTab";
import { NumberSeriesTab } from "@/components/settings/NumberSeriesTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { DigitaxSettingsTab } from "@/components/settings/DigitaxSettingsTab";
import { TaxRatesTab } from "@/components/settings/TaxRatesTab";
import { AccountingTab } from "@/components/settings/AccountingTab";
import { BackupTab } from "@/components/settings/BackupTab";
import { useFeatureLimit } from "@/components/FeatureGate";

import { useSearchParams } from "@/lib/router-compat";
import { usePermissions } from "@/hooks/usePermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import { useMemo, useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TabDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  permission: string;
  featureKey?: string;
  render: () => React.JSX.Element;
}

const NotAuthorized = () => (
  <div className="rounded-lg border bg-muted/30 p-8 text-center">
    <p className="text-sm text-muted-foreground">You don't have permission to view this section.</p>
  </div>
);

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const { hasFeatureKey } = useFeatureLimit();
  const { business } = useBusiness();
  const vatEnabled = (business as { vat_enabled?: boolean } | null)?.vat_enabled ?? false;

  const tabs: TabDef[] = useMemo(
    () => [
      {
        key: "business",
        label: "Business",
        icon: <Building2 className="h-4 w-4" />,
        permission: "settings.view",
        render: () => <BusinessProfileTab />,
      },
      {
        key: "branding",
        label: "Branding",
        icon: <Palette className="h-4 w-4" />,
        permission: "settings.view",
        render: () => <BrandingTab />,
      },
      {
        key: "locations",
        label: "Locations",
        icon: <MapPin className="h-4 w-4" />,
        permission: "settings.view",
        render: () => <LocationsTab />,
      },
      {
        key: "users",
        label: "Users",
        icon: <Users className="h-4 w-4" />,
        permission: "users.view",
        render: () => <UserManagementTab />,
      },
      {
        key: "roles",
        label: "Roles",
        icon: <ShieldCheck className="h-4 w-4" />,
        permission: "roles.view",
        render: () => <RolesPermissionsTab />,
      },
      {
        key: "payments",
        label: "Payment Accounts",
        icon: <Wallet className="h-4 w-4" />,
        permission: "banking.view",
        render: () => <PaymentAccountsTab />,
      },
      {
        key: "gateways",
        label: "Payment Gateways",
        icon: <Smartphone className="h-4 w-4" />,
        permission: "settings.edit",
        render: () => <PaymentGatewaysTab />,
      },
      {
        key: "receipt",
        label: "Customization",
        icon: <Receipt className="h-4 w-4" />,
        permission: "settings.edit",
        render: () => (
          <Tabs defaultValue="receipt-template" className="space-y-4">
            <TabsList>
              <TabsTrigger value="receipt-template">Receipt Template</TabsTrigger>
              <TabsTrigger value="price-tag-template">Price Tag Template</TabsTrigger>
            </TabsList>
            <TabsContent value="receipt-template" className="mt-0">
              <ReceiptSettingsTab />
            </TabsContent>
            <TabsContent value="price-tag-template" className="mt-0">
              <PriceTagSettingsTab />
            </TabsContent>
          </Tabs>
        ),
      },
      {
        key: "accounting",
        label: "Accounting",
        icon: <Calculator className="h-4 w-4" />,
        permission: "settings.edit",
        render: () => <AccountingTab />,
      },
      {
        key: "numbering",
        label: "Numbering",
        icon: <Hash className="h-4 w-4" />,
        permission: "settings.edit",
        render: () => <NumberSeriesTab />,
      },
      {
        key: "customer-display",
        label: "Customer Display",
        icon: <MonitorSmartphone className="h-4 w-4" />,
        permission: "settings.edit",
        render: () => <CustomerDisplayTab />,
      },
      {
        key: "integrations",
        label: "Integrations",
        icon: <Plug className="h-4 w-4" />,
        permission: "settings.edit",
        render: () => <IntegrationsTab />,
      },
      {
        key: "backup",
        label: "Backup & Restore",
        icon: <DatabaseBackup className="h-4 w-4" />,
        permission: "settings.view",
        render: () => <BackupTab />,
      },
      {
        key: "digitax",
        label: "Tax Compliance",
        icon: <FileCheck2 className="h-4 w-4" />,
        permission: "settings.edit",
        featureKey: "digitax",
        render: () => (
          <Tabs defaultValue="digitax-settings" className="space-y-4">
            <TabsList>
              <TabsTrigger value="digitax-settings">eTIMS / DigiTax</TabsTrigger>
              {vatEnabled && <TabsTrigger value="tax-rates">Tax Rates</TabsTrigger>}
            </TabsList>
            <TabsContent value="digitax-settings" className="mt-0">
              <DigitaxSettingsTab />
            </TabsContent>
            {vatEnabled && (
              <TabsContent value="tax-rates" className="mt-0">
                <TaxRatesTab />
              </TabsContent>
            )}
          </Tabs>
        ),
      },
      {
        key: "subscription",
        label: "Plan",
        icon: <CreditCard className="h-4 w-4" />,
        permission: "settings.view",
        render: () => <SubscriptionTab />,
      },
    ],
    [vatEnabled],
  );

  const allowed = tabs.filter((t) => hasPermission(t.permission) && (!t.featureKey || hasFeatureKey(t.featureKey)));
  const requested = searchParams.get("tab");
  const defaultTab = (requested && allowed.find((t) => t.key === requested)?.key) || allowed[0]?.key || "business";

  const [currentTab, setCurrentTab] = useState(defaultTab);
  useEffect(() => {
    setCurrentTab(defaultTab);
  }, [defaultTab]);

  if (allowed.length === 0) return <NotAuthorized />;

  const activeTab = allowed.find((t) => t.key === currentTab) ?? allowed[0];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your business, POS, accounting, and integrations.</p>
        </div>
      </div>

      {/* Mobile: dropdown selector */}
      <div className="md:hidden">
        <Select value={currentTab} onValueChange={setCurrentTab}>
          <SelectTrigger className="w-full">
            <SelectValue>
              <span className="flex items-center gap-2">
                {activeTab?.icon}
                {activeTab?.label}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowed.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                <span className="flex items-center gap-2">
                  {t.icon}
                  {t.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex flex-col md:flex-row gap-4 md:gap-5">
        {/* Desktop: vertical sidebar tabs */}
        <TabsList className="hidden md:flex text-muted-foreground md:flex-col h-fit max-h-[calc(100dvh-8rem)] overflow-y-auto w-full md:w-56 bg-muted/60 border border-border/60 rounded-xl p-1.5 shrink-0 md:items-start md:justify-start sticky top-20">
          {allowed.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0 rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              {t.icon}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 min-w-0">
          {allowed.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-0">
              {t.render()}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
