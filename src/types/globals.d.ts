export {};

declare global {
  interface Window {
    __DEBUG_SIDEBAR?: boolean;
    __DEBUG_SUBSCRIPTION?: boolean;
  }
}
