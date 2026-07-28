import { forwardRef, type ComponentProps } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<ComponentProps<typeof Link>, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
  end?: boolean;
}

// react-router's NavLink function-form className has no TanStack equivalent in
// the compat shim — active state is derived from the current location instead.
const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName: _pendingClassName, to, end, ...props }, ref) => {
    const { pathname } = useLocation();
    const target = (typeof to === "string" ? to : String(to)).split("?")[0].split("#")[0] || "/";
    const isActive = end
      ? pathname === target
      : pathname === target || (target !== "/" && pathname.startsWith(`${target}/`));

    return (
      <Link ref={ref} to={to} className={cn(className, isActive && activeClassName)} {...props} />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
