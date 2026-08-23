import React, { useCallback, useContext, useEffect, useState } from "react";
import { createStableContext } from "@/lib/stable-context";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { applyTheme, DEFAULT_THEME } from "@/lib/themes";
import { setPostingState } from "@/lib/postingGuard";
import { resolveBusinessId } from "@/lib/onboarding";
import { isSubscriptionCurrentlyActive, resolvePreferredSubscription } from "@/lib/subscriptionPlan";

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
  track_batches?: boolean;
  owner_id?: string | null;
  selected_package_id?: string | null;
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
  subscriptionExpired: boolean;
  subscriptionEndsAt: Date | null;
  createBusiness: (name: string, locationName: string, businessType?: string) => Promise<{ error: Error | null }>;
  refreshBusiness: () => Promise<void>;
  userRole: AppRole | null;
  hasAccess: (requiredRoles: AppRole[]) => boolean;
}

const BusinessContext = createStableContext<BusinessContextType | undefined>("business", undefined);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [isSuspended, setIsSuspended] = useState(false);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<Date | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  const fetchBusiness = useCallback(async () => {
    if (!user) {
      setBusiness(null);
      setLocations([]);
      setCurrentLocation(null);
      setLoading(false);
      setNeedsOnboarding(false);
      setUserRole(null);
      setIsSuspended(false);
      setSubscriptionEndsAt(null);
      setSubscriptionExpired(false);
      setPostingState({ expired: false, endsAt: null });
      return;
    }

    try {
      let businessId: string | null = null;

      {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("business_id")
          .eq("id", user.id)
          .maybeSingle();

        const { data: ownedBusiness } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("business_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        businessId = resolveBusinessId(
          profile?.business_id ?? null,
          roleRow?.business_id ?? null,
          ownedBusiness?.id ?? null,
        );

        if (!profileError && !profile && businessId) {
          await supabase.from("profiles").upsert({ id: user.id, business_id: businessId }, { onConflict: "id" });
        } else if (businessId && profile && profile.business_id !== businessId) {
          await supabase.from("profiles").update({ business_id: businessId }).eq("id", user.id);
        }
      }

      if (!businessId) {
        setNeedsOnboarding(true);
        setLoading(false);
        return;
      }

      const { data: biz } = await supabase.from("businesses").select("*").eq("id", businessId).single();

      if (biz) {
        setBusiness(biz as Business);
        setNeedsOnboarding(false);
        setIsSuspended(biz.is_active === false);
        // Business branding belongs to the signed-in business, not to the
        // user's role. Admins, managers, cashiers and stores managers all see
        // the same branding for their business.
        applyTheme((biz as { theme_color?: string }).theme_color || DEFAULT_THEME);

        // These requests do not depend on each other. Loading them together shortens
        // the time before a signed-in user can start using the application.
        const ownerId = (biz as { owner_id?: string | null }).owner_id;
        const subscriptionRequest = ownerId
          ? supabase
              .from("subscriptions")
              .select(
                "id, user_id, status, current_period_start, current_period_end, environment, created_at, updated_at",
              )
              .eq("user_id", ownerId)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] });
        const [subscriptionResult, roleResult, profileResult, locationsResult] = await Promise.all([
          subscriptionRequest,
          supabase.from("user_roles").select("role").eq("user_id", user.id).eq("business_id", biz.id).maybeSingle(),
          supabase.from("profiles").select("assigned_location_id").eq("id", user.id).maybeSingle(),
          supabase.from("locations").select("*").eq("business_id", biz.id).eq("is_active", true),
        ]);

        // Determine subscription expiry from the business owner's subscription.
        // Users can still log in when expired, but transaction posting is blocked.
        let endsAt: Date | null = null;
        let expired = false;
        if (ownerId) {
          const rows = Array.isArray(subscriptionResult.data) ? subscriptionResult.data : [];
          const subRow = resolvePreferredSubscription(rows as any[]);
          if (subRow) {
            endsAt = subRow.current_period_end ? new Date(subRow.current_period_end) : null;
            expired = !isSubscriptionCurrentlyActive(subRow);
          } else {
            // No subscription record → treat as expired unless business is active.
            expired = true;
          }
        }
        setSubscriptionEndsAt(endsAt);
        setSubscriptionExpired(expired);
        setPostingState({ expired, endsAt });

        const role = (roleResult.data?.role as AppRole) || null;
        setUserRole(role);

        const locationList = (locationsResult.data || []) as Location[];
        setLocations(locationList);

        const assignedId = (profileResult.data as { assigned_location_id?: string | null } | null)
          ?.assigned_location_id;
        const savedLocId = localStorage.getItem("currentLocationId");
        // Cashiers are pinned to their assigned till; others remember their last selection.
        const preferredId =
          role === "cashier" && assignedId ? assignedId : savedLocId || assignedId || locationList[0]?.id;
        const chosen = locationList.find((l) => l.id === preferredId) || locationList[0] || null;
        setCurrentLocation(chosen);
      } else {
        setNeedsOnboarding(true);
      }
    } catch {
      setNeedsOnboarding(true);
    }
    setLoading(false);
  }, [user]);

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
    if (!userRole) return false;
    return requiredRoles.includes(userRole);
  };

  // fetchBusiness is memoized so consumers such as useSubscription can safely
  // depend on refreshBusiness without creating an update-depth loop.
  useEffect(() => {
    fetchBusiness();
  }, [fetchBusiness]);

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
        subscriptionExpired,
        subscriptionEndsAt,

        createBusiness,
        refreshBusiness: fetchBusiness,
        userRole,
        hasAccess,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
};

/**
 * Safe variant for public/authentication screens that may render before the
 * authenticated business provider is mounted. It intentionally does not
 * throw when BusinessProvider is unavailable.
 */
export const useOptionalBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) {
    return {
      business: null,
      locations: [] as Location[],
      currentLocation: null,
      setCurrentLocation: (_location: Location) => {},
      loading: false,
      needsOnboarding: false,
      isSuspended: false,
      subscriptionExpired: false,
      subscriptionEndsAt: null,
      createBusiness: async () => ({ error: new Error("Business provider is not mounted") }),
      refreshBusiness: async () => {},
      userRole: null,
      hasAccess: (_requiredRoles: AppRole[]) => false,
    } satisfies BusinessContextType;
  }
  return context;
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) throw new Error("useBusiness must be used within BusinessProvider");
  return context;
};
