import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, Users, Receipt, CreditCard, ShieldCheck, Wallet, Smartphone, Palette, Hash } from "lucide-react";
import { BusinessProfileTab } from "@/components/settings/BusinessProfileTab";
import { BrandingTab } from "@/components/settings/BrandingTab";
import { LocationsTab } from "@/components/settings/LocationsTab";
import { UserManagementTab } from "@/components/settings/UserManagementTab";
import { ReceiptSettingsTab } from "@/components/settings/ReceiptSettingsTab";
import { SubscriptionTab } from "@/components/settings/SubscriptionTab";
import { RolesPermissionsTab } from "@/components/settings/RolesPermissionsTab";
import { PaymentAccountsTab } from "@/components/settings/PaymentAccountsTab";
import { PaymentGatewaysTab } from "@/components/settings/PaymentGatewaysTab";
import { NumberSeriesTab } from "@/components/settings/NumberSeriesTab";
import { useSearchParams } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useMemo } from "react";

interface TabDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  permission: string;
  render: () => JSX.Element;
}

const NotAuthorized = () => (
  <div className="rounded-lg border bg-muted/30 p-8 text-center">
    <p className="text-sm text-muted-foreground">You don't have permission to view this section.</p>
  </div>
);

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const { hasPermission } = usePermissions();

  const tabs: TabDef[] = useMemo(() => [
    { key: "business", label: "Business", icon: <Building2 className="h-4 w-4" />, permission: "settings.view", render: () => <BusinessProfileTab /> },
    { key: "branding", label: "Branding", icon: <Palette className="h-4 w-4" />, permission: "settings.view", render: () => <BrandingTab /> },
    { key: "locations", label: "Locations", icon: <MapPin className="h-4 w-4" />, permission: "settings.view", render: () => <LocationsTab /> },
    { key: "users", label: "Users", icon: <Users className="h-4 w-4" />, permission: "users.view", render: () => <UserManagementTab /> },
    { key: "roles", label: "Roles", icon: <ShieldCheck className="h-4 w-4" />, permission: "roles.view", render: () => <RolesPermissionsTab /> },
    { key: "payments", label: "Payment Accounts", icon: <Wallet className="h-4 w-4" />, permission: "banking.view", render: () => <PaymentAccountsTab /> },
    { key: "gateways", label: "Payment Gateways", icon: <Smartphone className="h-4 w-4" />, permission: "settings.edit", render: () => <PaymentGatewaysTab /> },
    { key: "receipt", label: "Receipt", icon: <Receipt className="h-4 w-4" />, permission: "settings.edit", render: () => <ReceiptSettingsTab /> },
    { key: "subscription", label: "Plan", icon: <CreditCard className="h-4 w-4" />, permission: "settings.view", render: () => <SubscriptionTab /> },
  ], []);

  const allowed = tabs.filter((t) => hasPermission(t.permission));
  const requested = searchParams.get("tab");
  const defaultTab = (requested && allowed.find((t) => t.key === requested)?.key) || allowed[0]?.key || "business";

  if (allowed.length === 0) return <NotAuthorized />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Tabs defaultValue={defaultTab} className="flex flex-col md:flex-row gap-4 md:gap-6">
        <TabsList className="text-muted-foreground flex md:flex-col h-auto w-full md:w-52 bg-muted rounded-lg p-1.5 shrink-0 md:items-start md:justify-start overflow-x-auto md:overflow-visible flex-nowrap">
          {allowed.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              {t.icon}{t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 min-w-0">
          {allowed.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-0">{t.render()}</TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
