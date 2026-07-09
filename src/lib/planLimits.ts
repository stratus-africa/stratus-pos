import { toast } from "sonner";

/**
 * Detects the "Plan limit reached" error raised by the enforce_business_plan_limit
 * trigger and shows a friendly toast with an Upgrade CTA. Returns true when the
 * error was a plan-limit error (caller can skip a generic toast).
 */
export function handlePlanLimitError(err: unknown, entityLabel?: string): boolean {
  const msg = (err as { message?: string })?.message || String(err ?? "");
  const isLimit = /plan limit reached/i.test(msg) || /Product limit reached/i.test(msg);
  if (!isLimit) return false;

  // Extract "up to N <label>"
  const m = msg.match(/up to\s+(\d+)\s+([a-z\/\s]+)/i);
  const max = m?.[1];
  const label = entityLabel || m?.[2]?.trim() || "records";

  toast.error(`Plan limit reached`, {
    description: max
      ? `Your subscription allows up to ${max} ${label}. Upgrade your plan to add more.`
      : `You've hit your plan limit for ${label}. Upgrade to add more.`,
    action: {
      label: "Upgrade",
      onClick: () => { window.location.href = "/settings?tab=subscription"; },
    },
    duration: 8000,
  });
  return true;
}
