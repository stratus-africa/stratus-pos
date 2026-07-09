export class TaxError extends Error {
  constructor(message: string, public code: string, public retryable = true) {
    super(message);
    this.name = "TaxError";
  }
}
export class TaxAuthError extends TaxError {
  constructor(message = "Invalid or expired credentials") { super(message, "AUTH", false); }
}
export class TaxNetworkError extends TaxError {
  constructor(message = "Network failure") { super(message, "NETWORK", true); }
}
export class TaxValidationError extends TaxError {
  constructor(message: string) { super(message, "VALIDATION", false); }
}
export class TaxDuplicateError extends TaxError {
  constructor(message = "Invoice already submitted") { super(message, "DUPLICATE", false); }
}
