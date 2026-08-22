import { supabase } from "@/integrations/supabase/client";

export type OnboardingDraft = {
  account: {
    email: string;
  };
  business: {
    companyName: string;
    businessType: string;
    contactPerson: string;
    contactPhone: string;
    kraPin: string;
    businessRegNo: string;
  };
  location: {
    name: string;
    type: "store" | "warehouse";
    address: string;
    city: string;
    county: string;
  };
  products: {
    mode: "manual" | "import" | "empty";
  };
  payments: {
    currency: string;
    timezone: string;
    vatEnabled: boolean;
    taxRate: string;
    taxInclusivePricing: boolean;
    mpesaEnabled: boolean;
    mpesaShortcode: string;
    mpesaPaybillOrTill: string;
    autoPrintReceipt: boolean;
  };
  team: {
    invites: Array<{ name: string; email: string; role: "manager" | "cashier" | "stores_manager" }>;
  };
  plan: {
    packageId: string;
  };
};

export const emptyOnboardingDraft = (email = ""): OnboardingDraft => ({
  account: { email },
  business: {
    companyName: "",
    businessType: "retail",
    contactPerson: "",
    contactPhone: "",
    kraPin: "",
    businessRegNo: "",
  },
  location: {
    name: "Main Branch",
    type: "store",
    address: "",
    city: "",
    county: "",
  },
  products: { mode: "empty" },
  payments: {
    currency: "KES",
    timezone: "Africa/Nairobi",
    vatEnabled: true,
    taxRate: "16",
    taxInclusivePricing: true,
    mpesaEnabled: true,
    mpesaShortcode: "",
    mpesaPaybillOrTill: "",
    autoPrintReceipt: false,
  },
  team: { invites: [] },
  plan: { packageId: "" },
});

export async function loadOnboardingDraft(userId: string, email = "") {
  const { data, error } = await (supabase as any)
    .from("onboarding_drafts")
    .select("current_step,data,completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { step: 1, draft: emptyOnboardingDraft(email), completed: false };

  return {
    step: Number(data.current_step || 1),
    draft: { ...emptyOnboardingDraft(email), ...(data.data || {}) } as OnboardingDraft,
    completed: Boolean(data.completed_at),
  };
}

export async function saveOnboardingDraft(userId: string, step: number, draft: OnboardingDraft) {
  const { error } = await (supabase as any).from("onboarding_drafts").upsert(
    {
      user_id: userId,
      current_step: Math.min(7, Math.max(1, step)),
      data: draft,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function completeSelfSignup() {
  const { data, error } = await (supabase as any).rpc("complete_self_signup");
  if (error) throw error;
  return data as { ok: boolean; business_id: string; location_id: string; already_created: boolean };
}

export function resolveBusinessId(
  profileBusinessId: string | null,
  roleBusinessId: string | null,
  ownerBusinessId?: string | null,
): string | null {
  return profileBusinessId || roleBusinessId || ownerBusinessId || null;
}
