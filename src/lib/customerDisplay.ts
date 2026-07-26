// Customer display pole (VFD / LCD line display) control via Web Serial or Web USB.
// Most poles are 2 lines x 20 chars and speak either ESC/POS display commands or plain text.
// Config is stored per-device in localStorage since the hardware is bound to the terminal.

export type CustomerDisplayMode = "off" | "serial" | "usb";
export type CustomerDisplayProtocol = "escpos" | "plain";

export interface CustomerDisplayConfig {
  mode: CustomerDisplayMode;
  protocol: CustomerDisplayProtocol;
  baudRate: number;
  columns: number;      // characters per line (usually 20)
  lines: number;        // 2 on almost every pole
  currency: string;     // prefix used for amounts
  welcomeLine1: string;
  welcomeLine2: string;
  thankYouLine1: string;
  thankYouLine2: string;
  showLineItems: boolean; // show last scanned item on line 1
}

const LS_KEY = "customerDisplay.config.v1";

export const DEFAULT_CUSTOMER_DISPLAY: CustomerDisplayConfig = {
  mode: "off",
  protocol: "escpos",
  baudRate: 9600,
  columns: 20,
  lines: 2,
  currency: "KES",
  welcomeLine1: "WELCOME",
  welcomeLine2: "Have a great day!",
  thankYouLine1: "THANK YOU",
  thankYouLine2: "Please come again",
  showLineItems: true,
};

export function loadCustomerDisplayConfig(): CustomerDisplayConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_CUSTOMER_DISPLAY };
    return { ...DEFAULT_CUSTOMER_DISPLAY, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CUSTOMER_DISPLAY };
  }
}

export function saveCustomerDisplayConfig(cfg: CustomerDisplayConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function isWebSerialSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}
export function isWebUsbSupported() {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

/** Pair a serial port for the display (needs a user gesture). */
export async function pickDisplaySerialPort(): Promise<boolean> {
  if (!isWebSerialSupported()) throw new Error("Web Serial is not supported in this browser");
  const port = await (navigator as any).serial.requestPort();
  return !!port;
}

/** Pair a USB device for the display (needs a user gesture). */
export async function pickDisplayUsbDevice(): Promise<boolean> {
  if (!isWebUsbSupported()) throw new Error("Web USB is not supported in this browser");
  const device = await (navigator as any).usb.requestDevice({ filters: [] });
  return !!device;
}

// --- text helpers -----------------------------------------------------------

function ascii(s: string) {
  return (s || "").normalize("NFKD").replace(/[^\x20-\x7E]/g, " ");
}

export function padLine(text: string, columns: number) {
  return ascii(text).slice(0, columns).padEnd(columns, " ");
}

/** Left text + right-aligned amount on one line. */
export function padPair(left: string, right: string, columns: number) {
  const r = ascii(right).slice(0, columns);
  const l = ascii(left).slice(0, Math.max(0, columns - r.length - 1));
  return (l + " ".repeat(Math.max(1, columns - l.length - r.length)) + r).slice(0, columns);
}

function encodeFrame(l1: string, l2: string, cfg: CustomerDisplayConfig) {
  const enc = new TextEncoder();
  const line1 = padLine(l1, cfg.columns);
  const line2 = cfg.lines > 1 ? padLine(l2, cfg.columns) : "";
  if (cfg.protocol === "escpos") {
    // ESC @ (init) + ESC t 0 + CLR (0x0C) + line1 + move to line2 (0x0A 0x0D) + line2
    const head = [0x1b, 0x40, 0x0c];
    const bytes = [
      ...head,
      ...Array.from(enc.encode(line1)),
      ...(cfg.lines > 1 ? [0x0a, 0x0d, ...Array.from(enc.encode(line2))] : []),
    ];
    return new Uint8Array(bytes);
  }
  return enc.encode(`\f${line1}${cfg.lines > 1 ? `\r\n${line2}` : ""}`);
}

// --- transport --------------------------------------------------------------

let serialPort: any = null;
let writing: Promise<void> = Promise.resolve();

async function writeSerial(bytes: Uint8Array, cfg: CustomerDisplayConfig) {
  if (!isWebSerialSupported()) return false;
  if (!serialPort) {
    const ports = await (navigator as any).serial.getPorts();
    serialPort = ports?.[0] ?? null;
  }
  if (!serialPort) return false;
  if (!serialPort.writable) {
    try { await serialPort.open({ baudRate: cfg.baudRate }); } catch { /* already open */ }
  }
  if (!serialPort.writable) return false;
  const writer = serialPort.writable.getWriter();
  try { await writer.write(bytes); } finally { writer.releaseLock(); }
  return true;
}

async function writeUsb(bytes: Uint8Array) {
  if (!isWebUsbSupported()) return false;
  const devices = await (navigator as any).usb.getDevices();
  const device = devices?.[0];
  if (!device) return false;
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  const iface = device.configuration.interfaces[0];
  const outEp = iface.alternates[0].endpoints.find((e: any) => e.direction === "out");
  if (!outEp) return false;
  try { await device.claimInterface(iface.interfaceNumber); } catch { /* already claimed */ }
  await device.transferOut(outEp.endpointNumber, bytes);
  return true;
}

/** Show two lines on the pole display. Silent-safe. */
export function displayLines(l1: string, l2 = "", cfg?: CustomerDisplayConfig): Promise<boolean> {
  const c = cfg ?? loadCustomerDisplayConfig();
  if (c.mode === "off") return Promise.resolve(false);
  const bytes = encodeFrame(l1, l2, c);
  // Serialise writes so rapid cart updates never interleave on the port.
  const task = writing.then(async () => {
    try {
      if (c.mode === "serial") return await writeSerial(bytes, c);
      if (c.mode === "usb") return await writeUsb(bytes);
    } catch (e) {
      console.warn("Customer display write failed:", e);
    }
    return false;
  });
  writing = task.then(() => undefined, () => undefined);
  return task;
}

export function formatAmount(amount: number, cfg: CustomerDisplayConfig) {
  return `${cfg.currency} ${Math.round(amount).toLocaleString()}`.trim();
}

/** Item just added + running total. */
export function displayLineItem(name: string, lineTotal: number, cartTotal: number, cfg?: CustomerDisplayConfig) {
  const c = cfg ?? loadCustomerDisplayConfig();
  const top = c.showLineItems
    ? padPair(name, formatAmount(lineTotal, c), c.columns)
    : padLine("TOTAL", c.columns);
  return displayLines(top, padPair("TOTAL", formatAmount(cartTotal, c), c.columns), c);
}

export function displayTotal(cartTotal: number, cfg?: CustomerDisplayConfig) {
  const c = cfg ?? loadCustomerDisplayConfig();
  return displayLines(padLine("AMOUNT DUE", c.columns), padPair("TOTAL", formatAmount(cartTotal, c), c.columns), c);
}

export function displayPaid(total: number, tendered: number, change: number, cfg?: CustomerDisplayConfig) {
  const c = cfg ?? loadCustomerDisplayConfig();
  return displayLines(
    padPair("PAID", formatAmount(tendered || total, c), c.columns),
    padPair("CHANGE", formatAmount(change, c), c.columns),
    c,
  );
}

export function displayWelcome(cfg?: CustomerDisplayConfig) {
  const c = cfg ?? loadCustomerDisplayConfig();
  return displayLines(c.welcomeLine1, c.welcomeLine2, c);
}

export function displayThankYou(cfg?: CustomerDisplayConfig) {
  const c = cfg ?? loadCustomerDisplayConfig();
  return displayLines(c.thankYouLine1, c.thankYouLine2, c);
}

export async function testCustomerDisplay(cfg: CustomerDisplayConfig) {
  const ok = await displayLines(padLine("DISPLAY TEST", cfg.columns), padPair("TOTAL", formatAmount(1234, cfg), cfg.columns), cfg);
  if (!ok) throw new Error("Display did not respond. Check the device is connected and paired.");
  return true;
}
