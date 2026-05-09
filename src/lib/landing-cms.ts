import { supabase } from "@/integrations/supabase/client";

export type SectionKey =
  | "hero"
  | "features"
  | "pricing"
  | "stats"
  | "how_it_works"
  | "testimonials"
  | "faq"
  | "cta";

export interface LandingSectionRow {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: any;
  sort_order: number;
  is_visible: boolean;
}

export const SECTION_META: Record<SectionKey, { label: string; description: string; sort: number }> = {
  hero:         { label: "Hero Section",     description: "Manage the main hero banner on your landing page.",        sort: 0 },
  stats:        { label: "Stats / Trust Bar",description: "Manage the trust bar stats shown below the hero section.", sort: 1 },
  features:     { label: "Features Section", description: "Manage feature cards displayed on the landing page.",       sort: 2 },
  how_it_works: { label: "How It Works",     description: "Manage the \"How It Works\" step cards on the landing page.", sort: 3 },
  testimonials: { label: "Testimonials",     description: "Manage customer reviews displayed on the landing page.",    sort: 4 },
  pricing:      { label: "Pricing Section",  description: "Configure how pricing plans are displayed on the landing page.", sort: 5 },
  faq:          { label: "FAQ Section",      description: "Manage frequently asked questions on the landing page.",    sort: 6 },
  cta:          { label: "Call To Action",   description: "Manage the CTA banner that encourages visitors to sign up.",sort: 7 },
};

export const DEFAULT_CONTENT: Record<SectionKey, { title: string; subtitle: string; content: any }> = {
  hero: {
    title: "Manage Your Inventory Smarter",
    subtitle: "All-in-One Stock Management Platform",
    content: {
      description: "Streamline your warehouse operations, track stock in real time, and grow your business with powerful POS, invoicing, and multi-location support.",
      primary_text: "Start Free Trial",
      primary_url: "/onboarding",
      secondary_text: "Learn More",
      secondary_url: "#features",
      hero_image: "",
      background_image: "",
    },
  },
  stats: {
    title: "By the Numbers",
    subtitle: "",
    content: {
      items: [
        { value: "10K+",  label: "Businesses",   icon: "bi bi-building",     active: true },
        { value: "50M+",  label: "Items Managed",icon: "bi bi-box-seam",     active: true },
        { value: "99.9%", label: "Uptime",       icon: "bi bi-shield-check", active: true },
        { value: "4.8/5", label: "User Rating",  icon: "bi bi-star-fill",    active: true },
      ],
    },
  },
  features: {
    title: "Everything You Need",
    subtitle: "Powerful features to run your entire inventory operation from one place.",
    content: {
      items: [
        { title: "Multi-Warehouse",   icon: "bi bi-building",        description: "Manage stock across unlimited warehouses.",            active: true },
        { title: "Point of Sale",     icon: "bi bi-shop-window",     description: "Built-in POS with barcode scanning and M-Pesa.",       active: true },
        { title: "Purchase & Sales",  icon: "bi bi-arrow-left-right",description: "Handle purchases, sales, returns, and quotations.",    active: true },
        { title: "Real-Time Reports", icon: "bi bi-graph-up-arrow",  description: "Dashboards and detailed reports for stock & profit.",  active: true },
        { title: "Team & Permissions",icon: "bi bi-people-fill",     description: "Invite your team with role-based permissions.",        active: true },
        { title: "WooCommerce",       icon: "bi bi-cart4",           description: "Sync your online store with your inventory.",          active: true },
        { title: "Online Store",      icon: "bi bi-globe",           description: "Sell online from your inventory in minutes.",          active: true },
        { title: "Client Portal",     icon: "bi bi-person-badge",    description: "Give clients access to invoices and statements.",      active: true },
        { title: "24+ Languages",     icon: "bi bi-translate",       description: "Localized for businesses around the world.",           active: true },
      ],
    },
  },
  how_it_works: {
    title: "Transparent & fair for every customer",
    subtitle: "Here is how plans, pricing, and your data are handled — no surprises.",
    content: {
      label: "How It Works",
      items: [
        { title: "Plan updates apply instantly",   icon: "bi bi-arrow-repeat",      color: "green",  active: true },
        { title: "Price changes are fair",         icon: "bi bi-credit-card",       color: "blue",   active: true },
        { title: "Plans cannot disappear on you",  icon: "bi bi-shield-check",      color: "amber",  active: true },
        { title: "Your data is isolated & secure", icon: "bi bi-database-lock",     color: "purple", active: true },
        { title: "Try before you buy",             icon: "bi bi-clock-history",     color: "teal",   active: true },
        { title: "Upgrade or downgrade anytime",   icon: "bi bi-arrow-up-circle",   color: "red",    active: true },
      ],
    },
  },
  testimonials: {
    title: "Loved by retailers",
    subtitle: "",
    content: {
      items: [
        { name: "Sarah Johnson", company: "Urban Retail Co.",   review: "Stocky transformed how we manage inventory across our three locations.", rating: 5, active: true },
        { name: "Ahmed Benali",  company: "MedSupply Direct",   review: "The multi-warehouse feature is a game-changer. We reduced transfers significantly.", rating: 5, active: true },
        { name: "Maria Chen",    company: "FreshMart Grocery",  review: "Easy to set up and the POS works flawlessly. Our cashiers were trained in minutes.", rating: 4, active: true },
      ],
    },
  },
  pricing: {
    title: "Simple, Transparent Pricing",
    subtitle: "Choose the plan that fits your business. Upgrade or downgrade anytime.",
    content: {
      show_monthly: true,
      show_yearly: true,
      load_from_db: true,
    },
  },
  faq: {
    title: "Frequently Asked Questions",
    subtitle: "",
    content: {
      items: [
        { question: "How long is the free trial?", answer: "Every new workspace comes with a 14-day free trial on the Professional plan. No credit card required.", active: true },
        { question: "Can I manage multiple warehouses?", answer: "Yes. All paid plans support unlimited warehouses with stock transfers, adjustments, and per-location reporting.", active: true },
        { question: "Is my data secure?", answer: "Absolutely. Each workspace has its own isolated database, encrypted connections, and automatic daily backups.", active: true },
        { question: "Can I import my existing products?", answer: "Yes. You can bulk-import products, clients, and suppliers via CSV. We also offer WooCommerce sync for online stores.", active: true },
        { question: "What payment methods do you accept?", answer: "We accept all major credit cards via Stripe, as well as PayPal, Paystack, and Flutterwave depending on your region.", active: true },
      ],
    },
  },
  cta: {
    title: "Ready to Take Control of Your Inventory?",
    subtitle: "Join thousands of businesses already using Stocky. Start your free trial today.",
    content: {
      button_text: "Get Started Free",
      button_url: "/onboarding",
      background_image: "",
    },
  },
};

export async function fetchSection(key: SectionKey): Promise<LandingSectionRow | null> {
  const { data } = await (supabase as any)
    .from("landing_content")
    .select("*")
    .eq("section_key", key)
    .maybeSingle();
  return (data as LandingSectionRow) || null;
}

export async function upsertSection(
  key: SectionKey,
  values: { title: string; subtitle: string; content: any; is_visible: boolean }
): Promise<{ error: any }> {
  const { error } = await (supabase as any)
    .from("landing_content")
    .upsert(
      {
        section_key: key,
        title: values.title,
        subtitle: values.subtitle,
        content: values.content,
        is_visible: values.is_visible,
        sort_order: SECTION_META[key].sort,
      },
      { onConflict: "section_key" }
    );
  return { error };
}

/** Loads all sections, falling back to defaults for any missing key */
export async function loadAllSections(): Promise<Record<SectionKey, { title: string; subtitle: string; content: any; is_visible: boolean }>> {
  const { data } = await (supabase as any).from("landing_content").select("*");
  const map: any = {};
  (Object.keys(SECTION_META) as SectionKey[]).forEach((k) => {
    const row = (data || []).find((r: any) => r.section_key === k);
    if (row) {
      map[k] = { title: row.title || "", subtitle: row.subtitle || "", content: row.content || {}, is_visible: row.is_visible !== false };
    } else {
      map[k] = { ...DEFAULT_CONTENT[k], is_visible: true };
    }
  });
  return map;
}
