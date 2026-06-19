import { describe, expect, it } from "vitest";

import { QueryArgError } from "./errors";
import { isValidSlug, optionalSlugArg, requireSlugArg } from "./storage-key";

describe("isValidSlug", () => {
  it("accepts typical product/site/step ids", () => {
    for (const slug of [
      "democat-x100-extr",
      "demo-plant",
      "prod_to_qa_pla",
      "90000300001",
      "raw_dwell_alpha_oxide",
    ]) {
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it("rejects path-traversal and separator characters", () => {
    for (const bad of [
      "..",
      ".",
      "../etc/passwd",
      "a/b",
      "a\\b",
      "with space",
      "",
      "/leading",
    ]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    expect(isValidSlug(undefined)).toBe(false);
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug(42)).toBe(false);
    expect(isValidSlug({})).toBe(false);
  });

  it("rejects over-long slugs", () => {
    expect(isValidSlug("a".repeat(129))).toBe(false);
    expect(isValidSlug("a".repeat(128))).toBe(true);
  });
});

describe("requireSlugArg", () => {
  it("returns a valid slug", () => {
    expect(
      requireSlugArg({ productId: "democat-x100-extr" }, "productId"),
    ).toBe("democat-x100-extr");
  });

  it("throws QueryArgError for an invalid or missing slug", () => {
    expect(() => requireSlugArg({ productId: "../x" }, "productId")).toThrow(
      QueryArgError,
    );
    expect(() => requireSlugArg({}, "productId")).toThrow(QueryArgError);
  });
});

describe("optionalSlugArg", () => {
  it("returns undefined when absent", () => {
    expect(optionalSlugArg({}, "siteId")).toBeUndefined();
    expect(optionalSlugArg({ siteId: null }, "siteId")).toBeUndefined();
  });

  it("validates when present", () => {
    expect(optionalSlugArg({ siteId: "demo-plant" }, "siteId")).toBe(
      "demo-plant",
    );
    expect(() => optionalSlugArg({ siteId: "a/b" }, "siteId")).toThrow(
      QueryArgError,
    );
  });
});
