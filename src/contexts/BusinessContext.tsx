import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { applyTheme, DEFAULT_THEME } from "@/lib/themes";

interface Business {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  logo_url: string | null;
  tax_rate: number;
  is_active: boolean;
  vat_enabled: boolean;
  prevent_overselling?: boolean;
  theme_color?: string;
  business_type?: string;
  kra_pin?: string | null;
}

interface Location {
  id: string;
  business_id: string;
  name: string;
  type: string;
  address: string | null;
  is_active: boolean;
}

type AppRole = "admin" | "manager" | "cashier" | "stores_manager";

interface BusinessContextType {
  business: Business | null;
  locations: Location[];
  currentLocation: Location | null;
  setCurrentLocation: (location: Location) => void;
  loading: boolean;
  needsOnboarding: boolean;
  isSuspended: boolean;
  createBusiness: (name: string, locationName: string, businessType?: string) => Promise<{ error: Error | null }>;
  refreshBusiness: () => Promise<void>;
  userRole: AppRole | null;
  hasAccess: (requiredRoles: AppRole[]) => boolean;
  isMasquerading: boolean;
  stopMasquerade: () => void;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [isSuspended, setIsSuspended] = useState(false);
  const [isMasquerading, setIsMasquerading] = useState(false);

  const fetchBusiness = async () => {
    if (!user) {
      setBusiness(null);
      setLocations([]);
      setCurrentLocation(null);
      setLoading(false);
      setNeedsOnboarding(false);
      setUserRole(null);
      setIsSuspended(false);
      setIsMasquerading(false);
      return;
    }

    try {
      // Check for masquerade mode (super admin viewing as another business)
      const masqueradeId = localStorage.getItem("masquerade_business_id");
      
      let businessId: string | null = null;
      
      if (masqueradeId) {
        // Verify user is super admin
        const { data: isSA } = await supabase.rpc("is_super_admin", { _user_id: user.id });
        if (isSA) {
          businessId = masqueradeId;
          setIsMasquerading(true);
        } else {
          localStorage.removeItem("masquerade_business_id");
        }
      }

      if (!businessId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("business_id")
          .eq("id", user.id)
          .single();
        businessId = profile?.business_id || null;
        setIsMasquerading(false);

        // Self-heal: if profile has no business_id but user has a role assignment
        // (e.g. invited by an admin), link them to that business automatically.
        if (!businessId) {
          const { data: roleRow } = await supabase
            .from("user_roles")
            .select("business_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();
          if (roleRow?.business_id) {
            await supabase
              .from("profiles")
              .update({ business_id: roleRow.business_id })
              .eq("id", user.id);
            businessId = roleRow.business_id;
          }
        }
      }

      if (!businessId) {
        setNeedsOnboarding(true);
        setLoading(false);
        return;
      }

      const { data: biz } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", businessId)
        .single();

      if (biz) {
        setBusiness(biz as Business);
        setNeedsOnboarding(false);
        setIsSuspended(biz.is_active === false);
        applyTheme((biz as { theme_color?: string }).theme_color || DEFAULT_THEME);

        // Fetch role + assigned location in parallel
        const [{ data: roleData }, { data: profileExtra }] = await Promise.all([
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("business_id", biz.id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("assigned_location_id")
            .eq("id", user.id)
            .maybeSingle(),
        ]);

        const role = (roleData?.role as AppRole) || null;
        setUserRole(role);

        const { data: locs } = await supabase
          .from("locations")
          .select("*")
          .eq("business_id", biz.id)
          .eq("is_active", true);

        const locationList = (locs || []) as Location[];
        setLocations(locationList);

        const assignedId = (profileExtra as { assigned_location_id?: string | null } | null)?.assigned_location_id;
        const savedLocId = localStorage.getItem("currentLocationId");
        // Cashiers are pinned to their assigned till; others remember their last selection.
        const preferredId =
          role === "cashier" && assignedId ? assignedId : (savedLocId || assignedId || locationList[0]?.id);
        const chosen = locationList.find((l) => l.id === preferredId) || locationList[0] || null;
        setCurrentLocation(chosen);
      } else {
        setNeedsOnboarding(true);
      }
    } catch {
      setNeedsOnboarding(true);
    }
    setLoading(false);
  };

  const createBusiness = async (name: string, locationName: string, businessType: string = "general") => {
    if (!user) return { error: new Error("Not authenticated") };

    try {
      const businessId = crypto.randomUUID();

      const { error: bizError } = await supabase
        .from("businesses")
        .insert({ id: businessId, name, business_type: businessType } as any);

      if (bizError) throw bizError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ business_id: businessId })
        .eq("id", user.id);

      if (profileError) throw profileError;

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: user.id, role: "admin", business_id: businessId });

      if (roleError) throw roleError;

      const { error: locError } = await supabase
        .from("locations")
        .insert({ business_id: businessId, name: locationName, type: "store" });

      if (locError) throw locError;

      await fetchBusiness();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const handleSetCurrentLocation = (location: Location) => {
    setCurrentLocation(location);
    localStorage.setItem("currentLocationId", location.id);
  };

  const hasAccess = (requiredRoles: AppRole[]) => {
    if (isMasquerading) return true; // Super admin has full access when masquerading
    if (!userRole) return false;
    return requiredRoles.includes(userRole);
  };

  const stopMasquerade = () => {
    localStorage.removeItem("masquerade_business_id");
    setIsMasquerading(false);
    fetchBusiness();
  };

  useEffect(() => {
    fetchBusiness();
  }, [user]);

  return (
    <BusinessContext.Provider
      value={{
        business,
        locations,
        currentLocation,
        setCurrentLocation: handleSetCurrentLocation,
        loading,
        needsOnboarding,
        isSuspended,
        createBusiness,
        refreshBusiness: fetchBusiness,
        userRole: isMasquerading ? "admin" : userRole,
        hasAccess,
        isMasquerading,
        stopMasquerade,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) throw new Error("useBusiness must be used within BusinessProvider");
  return context;
};
