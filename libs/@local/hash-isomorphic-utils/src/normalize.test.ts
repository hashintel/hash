import { describe, expect, test } from "vitest";

import { normalizeEmail } from "./normalize.js";

describe("normalizeEmail", () => {
  test("lowercases the address", () => {
    expect.hasAssertions();

    expect(normalizeEmail("User@Example.com")).toBe("user@example.com");
    expect(normalizeEmail("Signup-Allow@Example.COM")).toBe(
      "signup-allow@example.com",
    );
  });

  test("trims surrounding whitespace", () => {
    expect.hasAssertions();

    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
    expect(normalizeEmail("\tUser@Example.com\n")).toBe("user@example.com");
  });

  test("is idempotent on already-normalized input", () => {
    expect.hasAssertions();

    const normalized = normalizeEmail("User@Example.com");
    expect(normalizeEmail(normalized)).toBe(normalized);
  });

  test("only trims and lowercases — it does not canonicalize the local part", () => {
    expect.hasAssertions();

    // Guards the comparison contract: normalization must not strip `+tag`
    // suffixes or dots, which would silently change email matching everywhere.
    expect(normalizeEmail("First.Last+Tag@Example.com")).toBe(
      "first.last+tag@example.com",
    );
  });
});
