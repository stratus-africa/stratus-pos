import { describe, it, expect, vi } from "vitest";
import { buildBackupPayload, downloadBackupFile, validateBackupPayload } from "@/lib/backup";

describe("business backup payload", () => {
  it("builds a portable backup object with metadata and table data", () => {
    const payload = buildBackupPayload("business-123", {
      sales: [{ id: "sale-1", total: 1250 }],
      audit_logs: [{ id: "log-1", action: "created sale" }],
    });

    expect(payload.version).toBe(1);
    expect(payload.schema).toBe("stratus-backup");
    expect(payload.businessId).toBe("business-123");
    expect(payload.tables.sales).toEqual([{ id: "sale-1", total: 1250 }]);
    expect(payload.tables.audit_logs).toEqual([{ id: "log-1", action: "created sale" }]);
  });

  it("downloads a browser-safe backup file in the Vite environment", () => {
    const payload = buildBackupPayload("business-123", {
      sales: [{ id: "sale-1" }],
    });

    const originalURL = globalThis.URL;
    const createObjectURL = vi.fn(() => "blob:backup");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLAnchorElement;
      element.click = click;
      return element;
    });

    Object.defineProperty(globalThis, "URL", {
      value: {
        createObjectURL,
        revokeObjectURL,
      },
      configurable: true,
    });

    try {
      expect(() => downloadBackupFile(payload, "custom-backup.json")).not.toThrow();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");
      expect(click).toHaveBeenCalledTimes(1);
      expect(createElementSpy).toHaveBeenCalledWith("a");
    } finally {
      Object.defineProperty(globalThis, "URL", { value: originalURL, configurable: true });
    }
  });

  it("accepts a valid backup payload and rejects malformed data", () => {
    const valid = buildBackupPayload("business-123", {
      sales: [{ id: "sale-1" }],
    });

    const validCheck = validateBackupPayload(valid);
    expect(validCheck.valid).toBe(true);

    const invalidCheck = validateBackupPayload({
      version: 1,
      schema: "stratus-backup",
      businessId: "business-123",
      tables: null,
    } as any);

    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.error).toMatch(/tables/i);
  });
});
