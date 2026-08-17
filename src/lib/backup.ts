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

  return { valid: true, payload: candidate as BackupPayload };
}
