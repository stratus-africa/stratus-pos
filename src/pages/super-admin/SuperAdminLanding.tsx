import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, ExternalLink, Pencil, RefreshCw, Globe2, LayoutGrid, CheckCircle2, CircleOff } from "lucide-react";
import { SECTION_META, SectionKey, loadAllSections } from "@/lib/landing-cms";

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

const icons: Record<SectionKey, typeof Globe2> = {
  hero: Globe2,
  stats: LayoutGrid,
  features: LayoutGrid,
  how_it_works: LayoutGrid,
  testimonials: LayoutGrid,
  pricing: LayoutGrid,
  faq: LayoutGrid,
  cta: LayoutGrid,
};

export default function SuperAdminLanding() {
  const [sections, setSections] = useState<Awaited<ReturnType<typeof loadAllSections>> | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setSections(await loadAllSections());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const keys = (Object.keys(SECTION_META) as SectionKey[]).sort((a, b) => SECTION_META[a].sort - SECTION_META[b].sort);
  const visibleCount = sections ? keys.filter((k) => sections[k].is_visible).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Website CMS</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage the public StratusPOS front page from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" asChild>
            <a href="/landing" target="_blank" rel="noreferrer">
              <Eye className="mr-2 h-4 w-4" />
              Preview Live Page
            </a>
          </Button>
          <Button asChild>
            <Link to="/super-admin/cms/hero">
              <Pencil className="mr-2 h-4 w-4" />
              Edit Content
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">CMS Sections</p>
            <p className="text-2xl font-bold mt-1">{keys.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Visible on Front Page</p>
            <p className="text-2xl font-bold mt-1">{visibleCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Hidden Sections</p>
            <p className="text-2xl font-bold mt-1">{keys.length - visibleCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Front Page Sections</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((key) => {
            const meta = SECTION_META[key];
            const section = sections?.[key];
            const Icon = icons[key];
            return (
              <Link
                key={key}
                to={SECTION_PATH[key]}
                className="group rounded-xl border border-border/70 p-4 hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 text-primary p-2">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm truncate">{meta.label}</h3>
                      {section?.is_visible ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-emerald-700 border-emerald-200 bg-emerald-500/10"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Live
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">
                          <CircleOff className="h-3 w-3 mr-1" />
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meta.description}</p>
                    <div className="mt-3 text-xs text-primary group-hover:underline">Edit section →</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-semibold">Preview before publishing</p>
            <p className="text-sm text-muted-foreground mt-1">
              Changes are stored in the landing content table and are reflected on the public page. Use the live preview
              to verify the result.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/landing" target="_blank" rel="noreferrer">
              Open Preview <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
