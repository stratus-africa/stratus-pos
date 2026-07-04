// Central gate for anything that "posts" a transaction (sales, expenses,
// purchases, stock adjustments, journal entries, supplier payments, etc.).
// When the tenant's subscription is expired we still allow login and browsing
// but block writes with a friendly error the existing toast handlers surface.

import { toast } from "sonner";

type PostingState = {
  expired: boolean;
  endsAt: Date | null;
};

let state: PostingState = { expired: false, endsAt: null };

export function setPostingState(next: PostingState) {
  state = next;
}

export function getPostingState(): PostingState {
  return state;
}

export function canPost(): boolean {
  return !state.expired;
}

export const SUBSCRIPTION_EXPIRED_MESSAGE =
  "Your subscription has expired. Please renew to continue posting transactions.";

// Throw inside a mutationFn — existing onError handlers will surface the toast.
export function assertCanPost() {
  if (state.expired) {
    throw new Error(SUBSCRIPTION_EXPIRED_MESSAGE);
  }
}

// Use inside click handlers where no mutation onError is wired up.
export function ensureCanPost(): boolean {
  if (state.expired) {
    toast.error(SUBSCRIPTION_EXPIRED_MESSAGE);
    return false;
  }
  return true;
}
