import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useBusiness } from "@/contexts/BusinessContext";

const WARN_DAYS = 7;

/** Popup that reminds the tenant to renew when the plan is expiring or expired. */
export function SubscriptionReminderDialog() {
  const navigate = useNavigate();
  const { business } = useBusiness();
  const { subscription, isActive, isLoading, currentPackage } = useSubscription();
  const [open, setOpen] = useState(false);

  const end = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null;
  const expiring = daysLeft !== null && daysLeft <= WARN_DAYS;
  const shouldWarn = !isLoading && !!business && (!isActive || expiring);

  const key = business ? `sub_renew_reminder_${business.id}_${new Date().toISOString().slice(0, 10)}` : "";

  useEffect(() => {
    if (!shouldWarn || !key) return;
    if (localStorage.getItem(key)) return;
    setOpen(true);
  }, [shouldWarn, key]);

  const dismiss = () => {
    if (key) localStorage.setItem(key, "1");
    setOpen(false);
  };

  if (!shouldWarn) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {isActive ? "Your subscription is expiring soon" : "Your subscription is inactive"}
          </DialogTitle>
          <DialogDescription>
            {isActive && daysLeft !== null
              ? `Your ${currentPackage?.name ?? "current"} plan ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}${
                  end ? ` (${end.toLocaleDateString()})` : ""
                }. Renew now to avoid interruption.`
              : "Renew or choose a plan to keep using all features without interruption."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={dismiss}>Remind me later</Button>
          <Button
            onClick={() => {
              dismiss();
              navigate("/settings?tab=subscription");
            }}
          >
            Renew now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
