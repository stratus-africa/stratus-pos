import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface CmsPageShellProps {
  breadcrumb: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function CmsPageShell({ breadcrumb, title, description, actions, children }: CmsPageShellProps) {
  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/super-admin/landing" className="hover:text-foreground">CMS</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">{breadcrumb}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      <div className="space-y-5">{children}</div>
    </div>
  );
}
