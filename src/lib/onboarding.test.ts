import { describe, expect, it } from "vitest";
import { resolveBusinessId } from "./onboarding";

describe("resolveBusinessId", () => {
  it("prefers the profile business when it is present", () => {
    expect(resolveBusinessId("profile-biz", "role-biz")).toBe("profile-biz");
  });

  it("falls back to an assigned role when the profile is missing a business", () => {
    expect(resolveBusinessId(null, "role-biz")).toBe("role-biz");
  });

  it("returns null when no business is linked anywhere", () => {
    expect(resolveBusinessId(null, null)).toBeNull();
  });
});
