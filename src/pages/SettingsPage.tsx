import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, Users, Receipt, CreditCard, ShieldCheck, Percent, Wallet, Smartphone } from "lucide-react";
import { BusinessProfileTab } from "@/components/settings/BusinessProfileTab";
import { LocationsTab } from "@/components/settings/LocationsTab";
import { UserManagementTab } from "@/components/settings/UserManagementTab";
import { ReceiptSettingsTab } from "@/components/settings/ReceiptSettingsTab";
import { SubscriptionTab } from "@/components/settings/SubscriptionTab";
import { RolesPermissionsTab } from "@/components/settings/RolesPermissionsTab";
import { TaxSettingsTab } from "@/components/settings/TaxSettingsTab";
import { PaymentAccountsTab } from "@/components/settings/PaymentAccountsTab";
import { PaymentGatewaysTab } from "@/components/settings/PaymentGatewaysTab";
import { useSearchParams } from "react-router-dom";
import { useBusiness } from "@/contexts/BusinessContext";

const SettingsPage = () => {
  const [searchParams] = useSearchParams();
  const { business } = useBusiness();
  const vatEnabled = business?.vat_enabled !== false;
  const defaultTab = searchParams.get("tab") || "business";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Tabs defaultValue={defaultTab} className="flex flex-col md:flex-row gap-4 md:gap-6">
        <TabsList className="text-muted-foreground flex md:flex-col h-auto w-full md:w-52 bg-muted rounded-lg p-1.5 shrink-0 md:items-start md:justify-start overflow-x-auto md:overflow-visible flex-nowrap">
          <TabsTrigger value="business" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <Building2 className="h-4 w-4" />
            Business
          </TabsTrigger>
          <TabsTrigger value="locations" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <MapPin className="h-4 w-4" />
            Locations
          </TabsTrigger>
          {vatEnabled && (
            <TabsTrigger value="tax" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
              <Percent className="h-4 w-4" />
              Tax
            </TabsTrigger>
          )}
          <TabsTrigger value="users" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <ShieldCheck className="h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="payments" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <Wallet className="h-4 w-4" />
            Payment Accounts
          </TabsTrigger>
          <TabsTrigger value="gateways" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <Smartphone className="h-4 w-4" />
            Payment Gateways
          </TabsTrigger>
          <TabsTrigger value="receipt" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <Receipt className="h-4 w-4" />
            Receipt
          </TabsTrigger>
          <TabsTrigger value="subscription" className="md:w-full md:justify-start gap-2 text-sm px-3 py-2.5 shrink-0">
            <CreditCard className="h-4 w-4" />
            Plan
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0">
          <TabsContent value="business" className="mt-0"><BusinessProfileTab /></TabsContent>
          <TabsContent value="locations" className="mt-0"><LocationsTab /></TabsContent>
          {vatEnabled && <TabsContent value="tax" className="mt-0"><TaxSettingsTab /></TabsContent>}
          <TabsContent value="users" className="mt-0"><UserManagementTab /></TabsContent>
          <TabsContent value="roles" className="mt-0"><RolesPermissionsTab /></TabsContent>
          <TabsContent value="payments" className="mt-0"><PaymentAccountsTab /></TabsContent>
          <TabsContent value="gateways" className="mt-0"><PaymentGatewaysTab /></TabsContent>
          <TabsContent value="receipt" className="mt-0"><ReceiptSettingsTab /></TabsContent>
          <TabsContent value="subscription" className="mt-0"><SubscriptionTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
