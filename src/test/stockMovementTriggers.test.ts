import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const allMigrationsSql = (): string => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");
};

describe("Stock movement deletion triggers", () => {
  const sql = allMigrationsSql();

  it("links stock_adjustments to sales via sale_id", () => {
    expect(sql).toMatch(/stock_adjustments[\s\S]*ADD COLUMN IF NOT EXISTS sale_id/i);
  });

  it("creates a trigger that deletes stock movements when a sale is deleted", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.delete_adjustments_for_sale/);
    expect(sql).toMatch(/trg_delete_adjustments_for_sale/);
    expect(sql).toMatch(/DELETE FROM public\.stock_adjustments WHERE sale_id = OLD\.id/);
  });

  it("creates a trigger that restores inventory and removes stock movements on sale cancel", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_inventory_on_sale_cancel/);
    expect(sql).toMatch(/trg_reverse_inventory_on_sale_cancel/);
    // restore inventory branch
    expect(sql).toMatch(/inv\.quantity \+ si\.quantity/);
    // adjustments cleanup branch
    expect(sql).toMatch(/DELETE FROM public\.stock_adjustments WHERE sale_id = OLD\.id/);
  });

  it("revokes execute on the new SECURITY DEFINER trigger functions", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.delete_adjustments_for_sale/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.reverse_inventory_on_sale_cancel/);
  });
});
