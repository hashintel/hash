import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./normalize.js";

describe("normalizeEmail", () => {
  it("lowercases the address", () => {
    expect(normalizeEmail("User@Example.com")).toBe("user@example.com");
    expect(normalizeEmail("Signup-Allow@Example.COM")).toBe(
      "signup-allow@example.com",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
    expect(normalizeEmail("\tUser@Example.com\n")).toBe("user@example.com");
  });

  it("is idempotent on already-normalized input", () => {
    const normalized = normalizeEmail("User@Example.com");
    expect(normalizeEmail(normalized)).toBe(normalized);
  });

  it("only trims and lowercases — it does not canonicalize the local part", () => {
    // Guards the comparison contract: normalization must not strip `+tag`
    // suffixes or dots, which would silently change email matching everywhere.
    expect(normalizeEmail("First.Last+Tag@Example.com")).toBe(
      "first.last+tag@example.com",
    );
  });
});
