import { describe, expect, it } from "vitest";
import { normalizePermissions } from "./permissions";

describe("normalizePermissions", () => {
  it("adds view when create is granted", () => {
    expect(normalizePermissions(["products.create"])).toEqual(expect.arrayContaining(["products.create", "products.view"]));
  });

  it("adds view and create when edit is granted", () => {
    expect(normalizePermissions(["products.edit"])).toEqual(
      expect.arrayContaining(["products.edit", "products.create", "products.view"]),
    );
  });

  it("adds view, create, and edit when delete is granted", () => {
    expect(normalizePermissions(["products.delete"])).toEqual(
      expect.arrayContaining(["products.delete", "products.edit", "products.create", "products.view"]),
    );
  });

  it("does not add unsupported actions", () => {
    expect(normalizePermissions(["roles.edit"])).toEqual(expect.arrayContaining(["roles.edit", "roles.view"]));
    expect(normalizePermissions(["roles.edit"])).not.toContain("roles.create");
  });
});
