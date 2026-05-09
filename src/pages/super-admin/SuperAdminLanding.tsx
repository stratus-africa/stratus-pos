import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, BarChart3, LayoutGrid, Lightbulb, MessageSquare, DollarSign, HelpCircle, Megaphone, ChevronRight } from "lucide-react";
import { SECTION_META, SectionKey } from "@/lib/landing-cms";

const SECTION_ICON: Record<SectionKey, any> = {
  hero: Sparkles,
  stats: BarChart3,
  features: LayoutGrid,
  how_it_works: Lightbulb,
  testimonials: MessageSquare,
  pricing: DollarSign,
  faq: HelpCircle,
  cta: Megaphone,
};

const SECTION_PATH: Record<SectionKey, string> = {
  hero: "/super-admin/cms/hero",
  stats: "/super-admin/cms/stats",
  features: "/super-admin/cms/features",
  how_it_works: "/super-admin/cms/how-it-works",
  testimonials: "/super-admin/cms/testimonials",
  pricing: "/super-admin/cms/pricing",
  faq: "/super-admin/cms/faq",
  cta: "/super-admin/cms/cta",
};

export default function SuperAdminLanding() {
  const sections = (Object.keys(SECTION_META) as SectionKey[])
    .sort((a, b) => SECTION_META[a].sort - SECTION_META[b].sort);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Landing Page CMS</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage every section of your public landing page. Click a card to edit its content.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sections.map((key) => {
          const Icon = SECTION_ICON[key];
          const meta = SECTION_META[key];
          return (
            <Link key={key} to={SECTION_PATH[key]} className="group">
              <Card className="h-full transition-all border-border/70 hover:border-primary/50 hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 text-primary p-2.5 shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-sm text-foreground truncate">{meta.label}</h3>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meta.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
