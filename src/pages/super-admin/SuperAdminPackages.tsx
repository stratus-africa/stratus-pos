import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Tag, Pencil, Loader2, Package, Users, Warehouse, Contact,
  Truck, Settings2, Infinity as InfinityIcon,
} from "lucide-react";

interface PackageData {
  id: string;
  name: string;
  description: string | null;
  monthly_price_kes: number;
  yearly_price_kes: number;
  max_locations: number;
  max_products: number;
  max_users: number;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
}

interface PackageFeature {
  id: string;
  package_id: string;
  feature_key: string;
  feature_label: string;
  enabled: boolean;
}

const PALETTES = [
  { iconBg: "bg-violet-100", iconFg: "text-violet-600" },
  { iconBg: "bg-emerald-100", iconFg: "text-emerald-600" },
  { iconBg: "bg-emerald-600", iconFg: "text-white" },
  { iconBg: "bg-blue-100", iconFg: "text-blue-600" },
];

const fmtKes = (n: number) =>
  `KES ${new Intl.NumberFormat("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;

const isUnlimited = (n: number) => n < 0 || n >= 9999;

const LimitRow = ({
  Icon,
  label,
  value,
}: {
  Icon: React.ElementType;
  label: string;
  value: number;
}) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
    <span className="font-semibold">
      {isUnlimited(value) ? <InfinityIcon className="h-4 w-4 inline" /> : value.toLocaleString()}
    </span>
  </div>
);

export default function SuperAdminPackages() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [features, setFeatures] = useState<PackageFeature[]>([]);
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [pkgRes, featRes, subsRes] = await Promise.all([
      supabase.from("subscription_packages").select("*").order("sort_order"),
      supabase.from("package_features").select("*"),
      supabase.from("subscriptions").select("product_id, status"),
    ]);
    setPackages((pkgRes.data as any) || []);
    setFeatures((featRes.data as PackageFeature[]) || []);

    const counts: Record<string, number> = {};
    (subsRes.data || []).forEach((s: any) => {
      if (!s.product_id) return;
      if (s.status === "active" || s.status === "trialing") {
        counts[s.product_id] = (counts[s.product_id] || 0) + 1;
      }
    });
    setSubCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage billing plans, usage limits, and feature access for your tenants.
          </p>
        </div>
        <Button
          onClick={() => navigate("/super-admin/packages/new")}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" /> New plan
        </Button>
      </div>

      {packages.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-16 text-center">
          <Tag className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No plans yet. Click "New plan" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {packages.map((pkg, idx) => {
            const palette = PALETTES[idx % PALETTES.length];
            const enabledFeatures = features.filter(
              (f) => f.package_id === pkg.id && f.enabled
            );
            const slug = pkg.name.toLowerCase().replace(/\s+/g, "");
            const monthly = Number(pkg.monthly_price_kes || 0);
            const yearly = Number(pkg.yearly_price_kes || 0);
            const savePct =
              monthly > 0 && yearly > 0
                ? Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100))
                : 0;
            const subscribers = subCounts[pkg.id] || 0;

            return (
              <div
                key={pkg.id}
                className="bg-white border border-border rounded-xl overflow-hidden flex flex-col"
              >
                {/* Header */}
                <div className="p-5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`h-11 w-11 rounded-lg ${palette.iconBg} flex items-center justify-center shrink-0`}>
                      <Tag className={`h-5 w-5 ${palette.iconFg}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg leading-tight truncate">{pkg.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{slug}</p>
                    </div>
                  </div>
                  <Badge
                    className={
                      pkg.is_active
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${pkg.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    {pkg.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {/* Pricing */}
                <div className="px-5 pb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight">{fmtKes(monthly)}</span>
                    <span className="text-sm text-muted-foreground">/ mo</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">{fmtKes(yearly)} / yr</span>
                    {savePct > 0 && (
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-0 h-5">
                        Save {savePct}%
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Limits */}
                <div className="px-5 py-4 border-t border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Limits</span>
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-0 h-4 px-1.5">5</Badge>
                  </div>
                  <LimitRow Icon={Package} label="Products" value={pkg.max_products} />
                  <LimitRow Icon={Users} label="Users" value={pkg.max_users} />
                  <LimitRow Icon={Warehouse} label="Warehouses" value={pkg.max_locations} />
                  <LimitRow Icon={Contact} label="Customers" value={(pkg as any).max_customers ?? -1} />
                  <LimitRow Icon={Truck} label="Suppliers" value={(pkg as any).max_suppliers ?? -1} />
                </div>

                {/* Features */}
                <div className="px-5 py-4 border-t border-border flex-1">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Features</span>
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] py-0 h-4 px-1.5">
                      {enabledFeatures.length}
                    </Badge>
                  </div>
                  {enabledFeatures.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No features enabled.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {enabledFeatures.map((f) => (
                        <Badge
                          key={f.id}
                          className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-normal"
                        >
                          {f.feature_label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 border-t border-border flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {subscribers} subscriber{subscribers === 1 ? "" : "s"}
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                  >
                    <Link to={`/super-admin/packages/${pkg.id}/edit`}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
