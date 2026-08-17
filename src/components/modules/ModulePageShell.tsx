import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { findModule } from "@/lib/modules";
import { Link } from "@/lib/router-compat";

export type ModuleBreadcrumbItem = {
  label: string;
  href?: string;
};

export function ModuleBreadcrumbs({ moduleKey, items = [] }: { moduleKey: string; items?: ModuleBreadcrumbItem[] }) {
  const module = findModule(moduleKey);
  const crumbs: ModuleBreadcrumbItem[] = [
    { label: module?.label ?? "Module", href: module?.route ?? "/" },
    ...items,
  ];

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          return (
            <BreadcrumbItem key={`${crumb.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator />}
              {isCurrent ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link to={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function ModuleHeader({
  moduleKey,
  title,
  description,
  breadcrumb,
  primaryAction,
  secondaryActions,
  tabs,
  statusBadge,
}: {
  moduleKey: string;
  title?: string;
  description?: string;
  breadcrumb?: ModuleBreadcrumbItem[];
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  tabs?: ReactNode;
  statusBadge?: ReactNode;
}) {
  const module = findModule(moduleKey);

  return (
    <div className="space-y-4 pb-4">
      {breadcrumb ? <ModuleBreadcrumbs moduleKey={moduleKey} items={breadcrumb} /> : null}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {module?.category ?? "module"}
            </div>
            {statusBadge ?? null}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title ?? module?.label ?? "Module"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {description ?? module?.description ?? "Module overview"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {secondaryActions}
          {primaryAction ? <>{primaryAction}</> : null}
        </div>
      </div>

      {tabs ? <div className="rounded-xl border bg-card p-2">{tabs}</div> : null}
    </div>
  );
}

export function ModuleLandingPage({
  moduleKey,
  title,
  description,
  primaryAction,
  secondaryActions,
  quickActions,
  recentActivity,
  stats,
  sections,
}: {
  moduleKey: string;
  title?: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  quickActions?: Array<{ label: string; onClick?: () => void; disabled?: boolean; variant?: "default" | "secondary" | "outline" }>; 
  recentActivity?: ReactNode;
  stats?: Array<{ label: string; value: string; hint?: string }>;
  sections?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <ModuleHeader
        moduleKey={moduleKey}
        title={title}
        description={description}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        statusBadge={<Badge variant="secondary">Enabled</Badge>}
      />

      {stats && stats.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stat.value}</div>
                {stat.hint ? <p className="text-xs text-muted-foreground mt-1">{stat.hint}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>{recentActivity ?? <p className="text-sm text-muted-foreground">No recent activity yet.</p>}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions && quickActions.length > 0 ? (
              quickActions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant={action.variant ?? "outline"}
                  className="w-full justify-start"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.label}
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No quick actions available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {sections ? <div className="space-y-4">{sections}</div> : null}
    </div>
  );
}
