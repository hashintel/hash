import { describe, expect, it } from "vitest";

import {
  AtlasContractError,
  generationBytes,
  parseCurrent,
  parseManifest,
} from "./manifest";

const generationHex = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, "0"),
).join("");

const manifestBody = {
  generation: generationHex,
  wireVersion: 1,
  variants: ["plain"],
  bucketSchedule: { span: 64, cut: "z+6", maxZoom: 16 },
  scopeSchedule: { k: 0, cut: "z+6" },
  limits: {
    coloredTypeIds: 8,
    edgesTiles: 32,
    locateEdges: 512,
    locateProperties: 20,
    locateLinkTypeIds: 5,
    locateLinkProperties: 10,
  },
  createdAt: "2026-07-19T16:00:00Z",
};

describe("generationBytes", () => {
  it("decodes 64 hex characters into 32 raw bytes", () => {
    const bytes = generationBytes(generationHex);
    expect(bytes).toHaveLength(32);
    expect([...bytes.slice(0, 4)]).toEqual([0, 1, 2, 3]);
  });

  it("rejects a non-hex identity", () => {
    expect(() => generationBytes("not-hex")).toThrow(AtlasContractError);
  });
});

describe("parseCurrent", () => {
  it("returns the active generation", () => {
    expect(parseCurrent({ generation: generationHex })).toEqual({
      generation: generationHex,
    });
  });

  it("rejects a missing, non-string, or malformed generation", () => {
    expect(() => parseCurrent(null)).toThrow(AtlasContractError);
    expect(() => parseCurrent({})).toThrow(AtlasContractError);
    expect(() => parseCurrent({ generation: 5 })).toThrow(AtlasContractError);
    expect(() => parseCurrent({ generation: "abc" })).toThrow(
      AtlasContractError,
    );
  });
});

describe("parseManifest", () => {
  it("parses a well-formed manifest", () => {
    const manifest = parseManifest(manifestBody, generationHex);
    expect(manifest.variants).toEqual(["plain"]);
    expect(manifest.bucketSchedule.span).toBe(64);
    expect(manifest.bucketSchedule.maxZoom).toBe(16);
    expect(manifest.limits.coloredTypeIds).toBe(8);
    expect(manifest.limits.locateEdges).toBe(512);
    expect(manifest.limits.locateProperties).toBe(20);
    expect(manifest.limits.locateLinkTypeIds).toBe(5);
    expect(manifest.limits.locateLinkProperties).toBe(10);
    expect(manifest.scopeSchedule.k).toBe(0);
    expect(manifest.scopeSchedule.cut).toBe("z+6");
    expect(manifest.createdAt).toBe("2026-07-19T16:00:00Z");
  });

  it("carries a restricted caller's own delivery offset", () => {
    const manifest = parseManifest(
      { ...manifestBody, scopeSchedule: { k: 2, cut: "z+8" } },
      generationHex,
    );
    expect(manifest.scopeSchedule.k).toBe(2);
  });

  it("requires the scopeSchedule block, because a missing k reads as zero", () => {
    const { scopeSchedule: _omitted, ...withoutScope } = manifestBody;
    expect(() => parseManifest(withoutScope, generationHex)).toThrow(
      /scopeSchedule/u,
    );
    expect(() =>
      parseManifest(
        { ...manifestBody, scopeSchedule: { k: -1, cut: "z+6" } },
        generationHex,
      ),
    ).toThrow(/scopeSchedule k\/cut/u);
  });

  it("accepts an absent createdAt, which a fixture-fitted generation omits", () => {
    const { createdAt: _omitted, ...withoutCreatedAt } = manifestBody;
    expect(parseManifest(withoutCreatedAt, generationHex).createdAt).toBe(
      undefined,
    );
    expect(() =>
      parseManifest({ ...manifestBody, createdAt: 7 }, generationHex),
    ).toThrow(/createdAt/u);
  });

  it("requires the generation to echo the route", () => {
    expect(() => parseManifest(manifestBody, "f".repeat(64))).toThrow(
      /does not echo the route/u,
    );
  });

  it("requires the bucket-schedule span to be a power of two", () => {
    expect(() =>
      parseManifest(
        {
          ...manifestBody,
          bucketSchedule: { span: 63, cut: "z+6", maxZoom: 16 },
        },
        generationHex,
      ),
    ).toThrow(/power of two/u);
  });

  it("requires a non-empty variant set", () => {
    expect(() =>
      parseManifest({ ...manifestBody, variants: [] }, generationHex),
    ).toThrow(/variants/u);
  });

  it("rejects a non-object body", () => {
    expect(() => parseManifest(null, generationHex)).toThrow(
      AtlasContractError,
    );
  });
});
