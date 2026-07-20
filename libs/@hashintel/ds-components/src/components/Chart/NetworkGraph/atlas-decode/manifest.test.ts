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
  bucketSchedule: { span: 64, cut: "z+m", maxZoom: 16 },
  limits: { coloredTypeIds: 8, edgesTiles: 32, locateNeighbours: 64 },
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
          bucketSchedule: { span: 63, cut: "z+m", maxZoom: 16 },
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
