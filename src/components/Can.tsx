import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

interface Props {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/** Renders children only when the current user has the given permission key. */
export function Can({ permission, children, fallback = null }: Props) {
  const { hasPermission } = usePermissions();
  if (!hasPermission(permission)) return <>{fallback}</>;
  return <>{children}</>;
}
