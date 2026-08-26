import { toast } from "sonner";

/**
 * Maps raw Postgres / PostgREST / RPC error messages to clear,
 * user-facing explanations. Permission failures always explain WHAT
 * permission is missing and where an admin can grant it.
 */
export function friendlyErrorMessage(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error ?? "")).trim();
  const msg = raw.toLowerCase();

  if (!msg) return "Something went wrong. Please try again.";

  // Backend permission denials: "Not authorised to approve journals", etc.
  const notAuthorised = raw.match(/not authorised to (.+)/i);
  if (notAuthorised) {
    return `You don't have permission to ${notAuthorised[1].replace(/[.;]+$/, "")}. An administrator can grant this under Settings → Roles & Permissions.`;
  }

  if (msg.includes("permission denied") || msg.includes("42501")) {
    return "You don't have permission to perform this action. An administrator can grant it under Settings → Roles & Permissions.";
  }

  if (msg.includes("row-level security")) {
    return "Access to this record is restricted. It may belong to a different business, or your role does not allow this operation.";
  }

  // Accounting period messages are already specific — keep them.
  if (msg.includes("posting is not allowed")) return raw;

  if (msg.includes("creator cannot approve")) {
    return "A journal must be approved by a different user than the one who created it.";
  }

  if (msg.includes("journal not found")) {
    return "This journal entry is no longer available. It may have been deleted — refresh the list.";
  }

  return raw;
}

/** Toast a friendly error message; returns the message for callers that also log. */
export function toastFriendlyError(error: unknown): string {
  const message = friendlyErrorMessage(error);
  toast.error(message);
  return message;
}
