// Cash drawer control via Web Serial (COM) or Web USB (ESC/POS kick command).
// Config is stored per-device in localStorage since drivers are physically bound to the terminal.

export type CashDrawerMode = "off" | "serial" | "usb";

export interface CashDrawerConfig {
  mode: CashDrawerMode;
  baudRate: number;      // serial only
  kickCode: number[];    // ESC/POS kick pulse; default [0x1B, 0x70, 0x00, 0x19, 0xFA]
  autoOpen: boolean;     // open on payment completion
}

const LS_KEY = "cashDrawer.config.v1";
const SERIAL_PORT_KEY = "cashDrawer.serialPortSelected";

export const DEFAULT_CASH_DRAWER: CashDrawerConfig = {
  mode: "off",
  baudRate: 9600,
  kickCode: [0x1B, 0x70, 0x00, 0x19, 0xFA],
  autoOpen: true,
};

export function loadCashDrawerConfig(): CashDrawerConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_CASH_DRAWER };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CASH_DRAWER, ...parsed };
  } catch {
    return { ...DEFAULT_CASH_DRAWER };
  }
}

export function saveCashDrawerConfig(cfg: CashDrawerConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function isWebSerialSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isWebUsbSupported() {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

/** Ask the user to pick and remember a serial port (must be called from a user gesture). */
export async function pickSerialPort(): Promise<boolean> {
  if (!isWebSerialSupported()) throw new Error("Web Serial is not supported in this browser");
  const port = await (navigator as any).serial.requestPort();
  if (!port) return false;
  localStorage.setItem(SERIAL_PORT_KEY, "1");
  return true;
}

/** Ask the user to pick and remember a USB device (must be called from a user gesture). */
export async function pickUsbDevice(): Promise<boolean> {
  if (!isWebUsbSupported()) throw new Error("Web USB is not supported in this browser");
  const device = await (navigator as any).usb.requestDevice({ filters: [] });
  return !!device;
}

async function getGrantedSerialPort(): Promise<any | null> {
  const ports = await (navigator as any).serial.getPorts();
  return ports?.[0] ?? null;
}

async function getGrantedUsbDevice(): Promise<any | null> {
  const devices = await (navigator as any).usb.getDevices();
  return devices?.[0] ?? null;
}

/** Open the cash drawer. Returns true on success. Silent-safe (returns false on failure). */
export async function openCashDrawer(cfg?: CashDrawerConfig): Promise<boolean> {
  const c = cfg ?? loadCashDrawerConfig();
  if (c.mode === "off") return false;
  const bytes = new Uint8Array(c.kickCode);

  try {
    if (c.mode === "serial") {
      if (!isWebSerialSupported()) return false;
      const port = await getGrantedSerialPort();
      if (!port) return false;
      try { await port.open({ baudRate: c.baudRate }); } catch { /* already open */ }
      const writer = port.writable.getWriter();
      await writer.write(bytes);
      writer.releaseLock();
      try { await port.close(); } catch { /* noop */ }
      return true;
    }
    if (c.mode === "usb") {
      if (!isWebUsbSupported()) return false;
      const device = await getGrantedUsbDevice();
      if (!device) return false;
      if (!device.opened) await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      const iface = device.configuration.interfaces[0];
      const alt = iface.alternates[0];
      const outEp = alt.endpoints.find((e: any) => e.direction === "out");
      if (!outEp) return false;
      try { await device.claimInterface(iface.interfaceNumber); } catch { /* already */ }
      await device.transferOut(outEp.endpointNumber, bytes);
      return true;
    }
  } catch (e) {
    console.warn("Cash drawer open failed:", e);
    return false;
  }
  return false;
}

export async function testCashDrawer(cfg: CashDrawerConfig) {
  const ok = await openCashDrawer(cfg);
  if (!ok) throw new Error("Drawer did not respond. Check the device is connected and permission is granted.");
  return true;
}
