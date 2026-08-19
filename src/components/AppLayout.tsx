import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Eye, X, AlertTriangle } from "lucide-react";
import { useLocation, useNavigate } from "@/lib/router-compat";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { useIsMobilePortrait } from "@/hooks/use-mobile";

function MasqueradeBanner() {
  const { isMasquerading, business, stopMasquerade } = useBusiness();
  if (!isMasquerading) return null;

  return (
    <div className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-between text-sm text-amber-800">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span>
          Viewing as <strong>{business?.name}</strong> (masquerade mode)
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={stopMasquerade}
        className="text-amber-800 hover:text-amber-900 hover:bg-amber-200 h-7 px-2"
      >
        <X className="h-3 w-3 mr-1" /> Exit
      </Button>
    </div>
  );
}

function SubscriptionExpiredBanner() {
  const { subscriptionExpired, subscriptionEndsAt } = useBusiness();
  const navigate = useNavigate();

  if (!subscriptionExpired) return null;

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between text-sm text-destructive">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>
          Your subscription{" "}
          {subscriptionEndsAt ? (
            <>
              expired on <strong>{subscriptionEndsAt.toLocaleDateString()}</strong>
            </>
          ) : (
            <>is inactive</>
          )}
          . Transactions are blocked until you renew.
        </span>
      </div>

      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-3"
        onClick={() => navigate("/settings?tab=subscription")}
      >
        Renew Subscription
      </Button>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isPOS = location.pathname.startsWith("/pos");
  const isMobilePortrait = useIsMobilePortrait();
  const [open, setOpen] = useState(!isPOS);

  // Auto-collapse sidebar on POS; auto-expand when returning to Dashboard.
  const isDashboard = location.pathname === "/" || location.pathname.startsWith("/dashboard");

  useEffect(() => {
    if (isPOS) setOpen(false);
    else if (isDashboard) setOpen(true);
  }, [isPOS, isDashboard]);

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <div className="min-h-dvh flex w-full min-w-0 bg-background text-foreground">
        {!isMobilePortrait && <AppSidebar />}

        <div className="flex-1 flex flex-col min-w-0">
          <MasqueradeBanner />
          <SubscriptionExpiredBanner />

          <TopBar />

          <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto scroll-smooth touch-pan-y [-webkit-overflow-scrolling:touch] p-3 sm:p-4 lg:p-6 pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-6">
            {children}
          </main>

          <MobileBottomNav />
        </div>

        <CommandPalette />
      </div>
    </SidebarProvider>
  );
}
