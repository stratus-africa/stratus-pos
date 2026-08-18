export type BackupTableMap = Record<string, unknown[]>;

export interface BackupPayload {
  schema: "stratus-backup";
  version: 1;
  exportedAt: string;
  businessId: string;
  tables: BackupTableMap;
}

export function buildBackupPayload(
  businessId: string,
  tables: BackupTableMap,
): BackupPayload {
  return {
    schema: "stratus-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    businessId,
    tables,
  };
}

export function downloadBackupFile(payload: BackupPayload, customFilename?: string): void {
  if (typeof document === "undefined" || typeof Blob === "undefined") {
    throw new Error("Backup downloads require a browser environment.");
  }

  const urlApi = typeof URL !== "undefined" ? URL : null;
  if (!urlApi || typeof urlApi.createObjectURL !== "function" || typeof urlApi.revokeObjectURL !== "function") {
    throw new Error("Backup downloads require browser URL support.");
  }

  const safeFilename = customFilename ?? `backup-${payload.businessId}-${new Date(payload.exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = urlApi.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = safeFilename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  urlApi.revokeObjectURL(url);
}

export function validateBackupPayload(payload: unknown):
  | { valid: true; payload: BackupPayload }
  | { valid: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Backup payload must be an object." };
  }

  const candidate = payload as Record<string, unknown>;

  if (candidate.schema !== "stratus-backup") {
    return { valid: false, error: "Invalid backup schema." };
  }

  if (candidate.version !== 1) {
    return { valid: false, error: "Unsupported backup version." };
  }

  if (typeof candidate.businessId !== "string" || !candidate.businessId.trim()) {
    return { valid: false, error: "Backup payload is missing a valid businessId." };
  }

  if (!candidate.tables || typeof candidate.tables !== "object" || Array.isArray(candidate.tables)) {
    return { valid: false, error: "Backup payload tables must be an object." };
  }

  for (const [tableName, rows] of Object.entries(candidate.tables as Record<string, unknown>)) {
    if (typeof tableName !== "string" || !tableName.trim()) {
      return { valid: false, error: "Backup payload contains an invalid table name." };
    }
    if (!Array.isArray(rows)) {
      return { valid: false, error: `Backup table '${tableName}' must be an array.` };
    }
  }

  return { valid: true, payload: candidate as unknown as BackupPayload };
}
