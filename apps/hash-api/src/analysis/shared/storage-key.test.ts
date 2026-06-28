import { describe, expect, it } from "vitest";

import { AnalysisArgError } from "./errors";
import {
  isWebScopedKeyForWeb,
  isValidSlug,
  optionalSlugArg,
  requireSlugArg,
  webScopedKey,
} from "./storage-key";

import type { WebId } from "@blockprotocol/type-system";

describe("webScopedKey", () => {
  const webId = "00000000-0000-4000-8000-000000000001" as WebId;

  it("puts the webId after the analysis prefix", () => {
    const key = webScopedKey(webId, "supply-chain", "2026-06-15", "graph.json");
    expect(key).toBe(`analysis/${webId}/supply-chain/2026-06-15/graph.json`);
    expect(key.split("/")[0]).toBe("analysis");
    expect(key.split("/")[1]).toBe(webId);
  });

  it("works with just a namespace", () => {
    expect(webScopedKey(webId, "supply-chain")).toBe(
      `analysis/${webId}/supply-chain`,
    );
  });

  it("checks both the analysis prefix and webId segment", () => {
    const key = webScopedKey(webId, "supply-chain", "current.json");
    expect(isWebScopedKeyForWeb(key, webId)).toBe(true);
    expect(
      isWebScopedKeyForWeb(`${webId}/supply-chain/current.json`, webId),
    ).toBe(false);
    expect(
      isWebScopedKeyForWeb(
        "analysis/00000000-0000-4000-8000-000000000002/supply-chain/current.json",
        webId,
      ),
    ).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts typical product/site/step ids", () => {
    for (const slug of [
      "democat-x100-extr",
      "demo-plant",
      "prod_to_qa_pla",
      "90000300001",
      "raw_dwell_alpha_oxide",
      "procurement_alumina_activated_fo_24a_sa=170_20",
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

  it("throws AnalysisArgError for an invalid or missing slug", () => {
    expect(() => requireSlugArg({ productId: "../x" }, "productId")).toThrow(
      AnalysisArgError,
    );
    expect(() => requireSlugArg({}, "productId")).toThrow(AnalysisArgError);
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
      AnalysisArgError,
    );
  });
});
