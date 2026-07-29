/**
 * Blocks sign-ups made with throwaway / temporary mailbox providers.
 * Domain list covers the most common public disposable services.
 */
const DISPOSABLE_DOMAINS = new Set<string>([
  "0-mail.com", "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "33mail.com", "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net",
  "tempmailo.com", "tempmail.plus", "tempr.email", "tmpmail.org", "tmpmail.net",
  "throwawaymail.com", "trashmail.com", "trashmail.de", "trash-mail.com",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "grr.la",
  "sharklasers.com", "spam4.me", "mailinator.com", "mailinator.net",
  "maildrop.cc", "mailnesia.com", "mailcatch.com", "moakt.com", "mohmal.com",
  "dispostable.com", "getairmail.com", "getnada.com", "nada.email",
  "inboxkitten.com", "yopmail.com", "yopmail.fr", "yopmail.net",
  "fakeinbox.com", "emailondeck.com", "email-fake.com", "fakemail.net",
  "burnermail.io", "mytemp.email", "linshiyouxiang.net", "mail-temp.com",
  "discard.email", "spambog.com", "spamgourmet.com", "jetable.org",
  "one-time.email", "minuteinbox.com", "byom.de", "anonbox.net",
  "mail7.io", "mailsac.com", "harakirimail.com", "vomoto.com",
  "cs.email", "dropmail.me", "tempinbox.com", "tempmailaddress.com",
]);

/** Suffixes that catch subdomain-based throwaway services. */
const DISPOSABLE_SUFFIXES = [
  ".mailinator.com",
  ".yopmail.com",
  ".33mail.com",
  ".dropmail.me",
  ".temp-mail.org",
];

export function getEmailDomain(email: string): string {
  return (email.split("@")[1] || "").trim().toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  return DISPOSABLE_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/** Returns an error message when the email cannot be used to sign up. */
export function validateSignupEmail(email: string): string | null {
  const value = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return "Please enter a valid email address";
  }
  if (isDisposableEmail(value)) {
    return "Temporary or disposable email addresses are not allowed. Please use your business email.";
  }
  return null;
}
