export type BackupTableMap = Record<string, unknown[]>;

export interface BackupPayload {
  schema: "stratus-backup";
  version: 1;
  exportedAt: string;
  businessId: string;
  tables: BackupTableMap;
}

export interface BackupRestoreResult {
  payload: BackupPayload;
  rowsRestored: number;
  tablesRestored: number;
}

export interface BackupTablePreview {
  table: string;
  rowCount: number;
}

export interface BackupRestorePreview {
  payload: BackupPayload;
  targetBusinessId: string;
  tableSummaries: BackupTablePreview[];
  totalRows: number;
  tablesWithRows: number;
}

export function buildBackupPayload(businessId: string, tables: BackupTableMap): BackupPayload {
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

  const safeFilename =
    customFilename ??
    `backup-${payload.businessId}-${new Date(payload.exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
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

export async function parseBackupFile(file: File): Promise<BackupPayload> {
  if (!(file instanceof File)) {
    throw new Error("Please select a valid backup JSON file.");
  }

  let text = "";
  try {
    if (typeof file.text === "function") {
      text = await file.text();
    } else if (typeof FileReader !== "undefined") {
      text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Unable to read the backup file."));
        reader.readAsText(file);
      });
    } else {
      text = await new Response(file).text();
    }
  } catch (error) {
    throw new Error("The selected file is not valid JSON backup data.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("The selected file is not valid JSON backup data.");
  }

  const validation = validateBackupPayload(parsed);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return validation.payload;
}

function normalizeRowsForRestore(
  tableName: string,
  rows: unknown[],
  targetBusinessId: string,
): Record<string, unknown>[] {
  return (rows as Record<string, unknown>[]).flatMap((row) => {
    if (!row || typeof row !== "object") return [];

    const normalized = { ...row } as Record<string, unknown>;

    if ("business_id" in normalized) {
      normalized.business_id = targetBusinessId;
    }

    if (tableName === "businesses" && typeof normalized.id === "string") {
      normalized.id = targetBusinessId;
    }

    if (tableName === "profiles" && !normalized.business_id) {
      normalized.business_id = targetBusinessId;
    }

    if (tableName === "businesses" && !normalized.id) {
      normalized.id = targetBusinessId;
    }

    return [normalized];
  });
}

export function buildBackupRestorePreview(
  payload: BackupPayload | unknown,
  targetBusinessId?: string,
): BackupRestorePreview {
  const validation = validateBackupPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const safeTargetBusinessId = targetBusinessId?.trim() || validation.payload.businessId;
  const tableSummaries = Object.entries(validation.payload.tables).map(([table, rows]) => ({
    table,
    rowCount: Array.isArray(rows) ? rows.length : 0,
  }));

  const totalRows = tableSummaries.reduce((sum, { rowCount }) => sum + rowCount, 0);

  return {
    payload: validation.payload,
    targetBusinessId: safeTargetBusinessId,
    tableSummaries: tableSummaries.sort((a, b) => b.rowCount - a.rowCount),
    totalRows,
    tablesWithRows: tableSummaries.filter(({ rowCount }) => rowCount > 0).length,
  };
}

export async function restoreBackupPayload(
  payload: BackupPayload | unknown,
  client: {
    from: (tableName: string) => {
      upsert?: (...args: any[]) => Promise<{ error: Error | null }>;
      insert?: (...args: any[]) => Promise<{ error: Error | null }>;
    };
  },
  targetBusinessId?: string,
): Promise<BackupRestoreResult> {
  const validation = validateBackupPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const safeTargetBusinessId = targetBusinessId?.trim() || validation.payload.businessId;
  let rowsRestored = 0;
  let tablesRestored = 0;

  for (const [tableName, rows] of Object.entries(validation.payload.tables)) {
    const normalizedRows = normalizeRowsForRestore(tableName, rows, safeTargetBusinessId);
    if (!normalizedRows.length) continue;

    const tableQuery = client.from(tableName);

    try {
      const upsertFn = tableQuery.upsert;
      if (typeof upsertFn === "function") {
        const result = await upsertFn(normalizedRows as never, { onConflict: "id" });
        if (result && typeof result === "object" && "error" in result && result.error) {
          throw result.error;
        }
      } else {
        const insertFn = tableQuery.insert;
        if (typeof insertFn !== "function") {
          throw new Error(`Restore is not supported for table '${tableName}'.`);
        }
        const result = await insertFn(normalizedRows as never);
        if (result && typeof result === "object" && "error" in result && result.error) {
          throw result.error;
        }
      }

      rowsRestored += normalizedRows.length;
      tablesRestored += 1;
    } catch (error) {
      const insertFn = tableQuery.insert;
      if (typeof insertFn === "function") {
        try {
          const result = await insertFn(normalizedRows as never);
          if (result && typeof result === "object" && "error" in result && result.error) {
            throw result.error;
          }
          rowsRestored += normalizedRows.length;
          tablesRestored += 1;
          continue;
        } catch (insertError) {
          throw new Error(
            `Failed to restore ${tableName}: ${insertError instanceof Error ? insertError.message : "unknown error"}`,
          );
        }
      }

      throw new Error(`Failed to restore ${tableName}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return {
    payload: validation.payload,
    rowsRestored,
    tablesRestored,
  };
}

export function validateBackupPayload(
  payload: unknown,
): { valid: true; payload: BackupPayload } | { valid: false; error: string } {
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
